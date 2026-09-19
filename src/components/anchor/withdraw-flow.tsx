"use client";

import { useEffect, useState } from "react";
import { buildWithdrawPaymentTx, submitFailureReason, submitSigned } from "@/lib/anchor/chain";
import { ANCHOR_ASSET_CODE, FIAT_CODE, POLL_INTERVAL_MS } from "@/lib/anchor/config";
import { fetchTransaction, isSettled, startWithdraw } from "@/lib/anchor/sep6";
import { fetchPrice, fetchQuote } from "@/lib/anchor/sep38";
import type {
  AnchorCurrency,
  AnchorSession,
  AnchorTransaction,
  WithdrawInstructions,
} from "@/lib/anchor/types";
import { said } from "./ramp";
import { StatusLine } from "./status-line";

/**
 * The off-ramp: USDC out, lira in.
 *
 * The mirror image of the deposit with one real difference — the user moves
 * the money this time, so there is a transaction to sign. It carries a memo,
 * and the memo is the entire identity of the order: the anchor has no other
 * way to tell which withdrawal a payment into its treasury settles. A payment
 * built by hand in a wallet, without it, arrives as an anonymous credit and is
 * a support ticket rather than a withdrawal.
 *
 * Which is why the transaction is built here and not left to anyone: the memo
 * is attached before the wallet ever sees it.
 */
export function WithdrawFlow({
  session,
  currency,
  balance,
  signTransaction,
  onSettled,
}: {
  session: AnchorSession;
  currency: AnchorCurrency;
  balance: string;
  signTransaction: (xdr: string) => Promise<string>;
  onSettled: () => void;
}) {
  const [amount, setAmount] = useState("10");
  const [quoted, setQuoted] = useState<string | null>(null);
  const [order, setOrder] = useState<WithdrawInstructions | null>(null);
  const [tx, setTx] = useState<AnchorTransaction | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [busy, setBusy] = useState<"start" | "pay" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = Number(amount);
    if (!value || value <= 0 || order) return;

    let live = true;
    const timer = setTimeout(() => {
      fetchPrice("off", String(value), session.token)
        .then((price) => live && setQuoted(price.buyAmount))
        .catch(() => live && setQuoted(null));
    }, 400);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [amount, order, session.token]);

  useEffect(() => {
    if (!order) return;
    let live = true;

    const poll = async () => {
      try {
        const next = await fetchTransaction(order.id, session.token);
        if (!live) return;
        setTx(next);
        if (isSettled(next.status)) onSettled();
      } catch {
        // Missing one poll changes nothing; the next says the same or better.
      }
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [order, session.token, onSettled]);

  const start = async () => {
    if (busy) return;
    setBusy("start");
    setError(null);
    try {
      const quote = await fetchQuote("off", amount, session.token);
      const next = await startWithdraw({
        amount,
        token: session.token,
        quoteId: quote.id,
      });
      setQuoted(quote.buyAmount);
      setOrder(next);
    } catch (e) {
      setError(said(e));
    } finally {
      setBusy(null);
    }
  };

  /** The payment, with the memo the anchor will match it by. */
  const pay = async () => {
    if (!order || busy) return;
    setBusy("pay");
    setError(null);
    try {
      const xdr = await buildWithdrawPaymentTx({
        from: session.account,
        destination: order.accountId,
        amount,
        memo: order.memo,
        memoType: order.memoType,
        currency,
      });
      const signed = await signTransaction(xdr);
      setHash(await submitSigned(signed));
    } catch (e) {
      setError(
        /reject|denied|declin|cancel/i.test(
          e instanceof Error ? e.message : "",
        )
          ? "You declined the signature, so nothing was sent."
          : submitFailureReason(e),
      );
    } finally {
      setBusy(null);
    }
  };

  if (order) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-rule bg-paper p-5">
          <p className="text-sm text-ink">
            Send{" "}
            <span className="font-medium tabular-nums">
              {Number(amount).toFixed(2)} {ANCHOR_ASSET_CODE}
            </span>{" "}
            to the anchor, and it pays{" "}
            <span className="font-medium tabular-nums">
              {quoted ? Number(quoted).toLocaleString("tr-TR") : "—"} {FIAT_CODE}
            </span>{" "}
            to your IBAN.
          </p>

          <dl className="mt-4 space-y-2.5">
            <Field label="To" value={order.accountId} />
            <Field label={`Memo (${order.memoType})`} value={order.memo} />
          </dl>

          <p className="mt-4 text-xs text-pretty text-ink-faint">
            The memo is what ties this payment to this order. The button below
            attaches it, so there is nothing to copy anywhere.
          </p>

          <button
            type="button"
            onClick={pay}
            disabled={busy !== null || hash !== null}
            className="mt-5 rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-slate disabled:opacity-60"
          >
            {busy === "pay"
              ? "Waiting for your wallet…"
              : hash
                ? "Sent"
                : `Send ${Number(amount).toFixed(2)} ${ANCHOR_ASSET_CODE}`}
          </button>
        </div>

        <StatusLine
          tx={tx}
          hash={hash}
          expect={`${quoted ? Number(quoted).toLocaleString("tr-TR") : "—"} ${FIAT_CODE}`}
        />

        {tx && isSettled(tx.status) && (
          <button
            type="button"
            onClick={() => {
              setOrder(null);
              setTx(null);
              setHash(null);
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
        <span className="flex items-baseline justify-between text-[0.6875rem] text-ink-faint">
          You send ({ANCHOR_ASSET_CODE})
          <button
            type="button"
            onClick={() => setAmount(Number(balance).toFixed(2))}
            className="transition-colors hover:text-ink"
          >
            balance {Number(balance).toFixed(2)}
          </button>
        </span>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-rule bg-paper px-3 py-2.5 text-lg tabular-nums text-ink outline-none transition-colors focus:border-rule-strong"
        />
      </label>

      <p className="mt-3 text-sm text-ink-dim">
        You get{" "}
        <span className="tabular-nums text-ink">
          {quoted ? Number(quoted).toLocaleString("tr-TR") : "—"} {FIAT_CODE}
        </span>{" "}
        <span className="text-ink-faint">to your IBAN, simulated FAST.</span>
      </p>

      <button
        type="button"
        onClick={start}
        disabled={busy !== null || !(Number(amount) > 0)}
        className="mt-5 w-full rounded-lg bg-slate-deep px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-slate disabled:opacity-60"
      >
        {busy === "start" ? "Asking the anchor…" : "Lock this rate and start"}
      </button>

      {error && <p className="mt-3 text-sm text-pretty text-fall">{error}</p>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <dt className="min-w-28 text-[0.6875rem] text-ink-faint">{label}</dt>
      <dd className="font-mono text-sm break-all text-ink">{value}</dd>
    </div>
  );
}
