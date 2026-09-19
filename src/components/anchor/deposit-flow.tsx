"use client";

import { useEffect, useState } from "react";
import { ANCHOR_ASSET_CODE, FIAT_CODE, POLL_INTERVAL_MS } from "@/lib/anchor/config";
import {
  fetchTransaction,
  isSettled,
  simulateBankTransfer,
  startDeposit,
} from "@/lib/anchor/sep6";
import { fetchPrice, fetchQuote } from "@/lib/anchor/sep38";
import type {
  AnchorSession,
  AnchorTransaction,
  DepositInstructions,
} from "@/lib/anchor/types";
import { said } from "./ramp";
import { StatusLine } from "./status-line";

/**
 * The on-ramp: lira in, USDC out.
 *
 * Four beats, and the screen never gets ahead of them. The user names an
 * amount in lira and is quoted against it while they type; starting the
 * deposit locks that quote and returns bank details; the money arrives (here,
 * because a button said it did); the anchor pays out on Stellar.
 *
 * The rate is locked with a SEP-38 quote rather than left floating, so the
 * number on the confirm button is the number that gets paid. That is the whole
 * reason the quote endpoint exists, and skipping it would mean quoting a rate
 * and settling at another one.
 */
export function DepositFlow({
  session,
  trusted,
  onSettled,
}: {
  session: AnchorSession;
  /** Without a trustline the anchor has nowhere to pay, and says so. */
  trusted: boolean;
  onSettled: () => void;
}) {
  const [amount, setAmount] = useState("1000");
  const [quoted, setQuoted] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<DepositInstructions | null>(null);
  const [tx, setTx] = useState<AnchorTransaction | null>(null);
  const [busy, setBusy] = useState<"start" | "bank" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // An indicative price while they type. Debounced, because it is a call to
  // somebody else's server on every keystroke otherwise.
  useEffect(() => {
    const value = Number(amount);
    if (!value || value <= 0 || instructions) return;

    let live = true;
    const timer = setTimeout(() => {
      fetchPrice("on", String(value), session.token)
        .then((price) => live && setQuoted(price.buyAmount))
        .catch(() => live && setQuoted(null));
    }, 400);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [amount, instructions, session.token]);

  // Once an order exists, the anchor is the source of truth for where it is.
  useEffect(() => {
    if (!instructions) return;
    let live = true;

    const poll = async () => {
      try {
        const next = await fetchTransaction(instructions.id, session.token);
        if (!live) return;
        setTx(next);
        if (isSettled(next.status)) onSettled();
      } catch {
        // A poll that fails is a poll; the next one will say the same thing or
        // something better. Nothing here is lost by missing one.
      }
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [instructions, session.token, onSettled]);

  const start = async () => {
    if (busy) return;
    setBusy("start");
    setError(null);
    try {
      const quote = await fetchQuote("on", amount, session.token);
      const next = await startDeposit({
        account: session.account,
        amount,
        token: session.token,
        quoteId: quote.id,
      });
      setQuoted(quote.buyAmount);
      setInstructions(next);
    } catch (e) {
      setError(said(e));
    } finally {
      setBusy(null);
    }
  };

  /** The sandbox's bank. On a real anchor this button does not exist. */
  const pretendToPay = async () => {
    if (!instructions || busy) return;
    setBusy("bank");
    setError(null);
    try {
      await simulateBankTransfer(instructions.id, amount);
    } catch (e) {
      setError(said(e));
    } finally {
      setBusy(null);
    }
  };

  if (instructions) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-rule bg-paper p-5">
          <p className="text-sm text-ink">
            Send{" "}
            <span className="font-medium tabular-nums">
              {Number(amount).toLocaleString("tr-TR")} {FIAT_CODE}
            </span>{" "}
            to the account below, with the reference in the description.
          </p>

          <dl className="mt-4 space-y-2.5">
            {Object.entries(instructions.instructions ?? {}).map(([key, field]) => (
              <div key={key} className="flex flex-wrap items-baseline gap-x-3">
                <dt className="min-w-28 text-[0.6875rem] text-ink-faint">
                  {field.description ?? key}
                </dt>
                <dd className="font-mono text-sm break-all text-ink">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>

          {instructions.extraInfo?.message && (
            <p className="mt-4 text-xs text-pretty text-ink-faint">
              {instructions.extraInfo.message}
            </p>
          )}

          <button
            type="button"
            onClick={pretendToPay}
            disabled={busy !== null || (tx ? isSettled(tx.status) : false)}
            className="mt-5 rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-slate disabled:opacity-60"
          >
            {busy === "bank" ? "Sending…" : "I sent the transfer (simulated)"}
          </button>
          <p className="mt-2 text-xs text-ink-faint">
            This button is the sandbox standing in for your bank. On a real
            anchor the money simply arrives and nothing here is clicked.
          </p>
        </div>

        <StatusLine tx={tx} expect={`${quoted ?? "—"} ${ANCHOR_ASSET_CODE}`} />

        {tx && isSettled(tx.status) && (
          <button
            type="button"
            onClick={() => {
              setInstructions(null);
              setTx(null);
            }}
            className="rounded-lg border border-rule px-4 py-2 text-sm text-ink-dim transition-colors hover:text-ink"
          >
            Start another
          </button>
        )}

        {error && <p className="text-sm text-pretty text-fall">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rule bg-paper p-5">
      <label className="block">
        <span className="text-[0.6875rem] text-ink-faint">
          You send ({FIAT_CODE})
        </span>
        <input
          type="number"
          min={0}
          step={50}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-rule bg-paper px-3 py-2.5 text-lg tabular-nums text-ink outline-none transition-colors focus:border-rule-strong"
        />
      </label>

      <p className="mt-3 text-sm text-ink-dim">
        You get{" "}
        <span className="tabular-nums text-ink">
          {quoted ? Number(quoted).toFixed(2) : "—"} {ANCHOR_ASSET_CODE}
        </span>{" "}
        <span className="text-ink-faint">
          at the anchor&apos;s rate, its spread included.
        </span>
      </p>

      {!trusted && (
        <p className="mt-3 text-xs text-pretty text-fall">
          Add the {ANCHOR_ASSET_CODE} trustline first, or the deposit will sit
          waiting for somewhere to land.
        </p>
      )}

      <button
        type="button"
        onClick={start}
        disabled={busy !== null || !trusted || !(Number(amount) > 0)}
        className="mt-5 w-full rounded-lg bg-slate-deep px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-slate disabled:opacity-60"
      >
        {busy === "start" ? "Asking the anchor…" : "Lock this rate and start"}
      </button>

      {error && <p className="mt-3 text-sm text-pretty text-fall">{error}</p>}
    </div>
  );
}
