"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/session-store";
import {
  explorerContractUrl,
  explorerTxUrl,
  formatXlm,
  PAYOUT_CONTRACT_ID,
  truncateAddress,
} from "@/lib/stellar/config";

/**
 * The payout vault, from the operator's side.
 *
 * Two numbers matter and they are in tension: what the contract holds, and how
 * much of that is already owed to contributors. The difference is the headroom
 * for crediting new sales — and it is also the only part the operator can ever
 * take back out. Once a sale is credited, that money answers to the
 * contributor's key, not ours.
 *
 * Crediting is the operator's whole job here. It is what turns a row in our
 * database into a claim nobody needs our permission to collect.
 */
export function VaultCard({
  pendingCount,
  pendingStroops,
  onCredited,
}: {
  pendingCount: number;
  pendingStroops: number;
  onCredited: () => void;
}) {
  const [vault, setVault] = useState<{
    funded: number;
    owed: number;
    surplus: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<"credit" | null>(null);
  const [note, setNote] = useState<{ text: string; hash?: string } | null>(null);

  const read = useCallback(async () => {
    const res = await fetch("/api/payouts");
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error);
    return body.vault as { funded: number; owed: number; surplus: number };
  }, []);

  const refresh = useCallback(async () => {
    try {
      setVault(await read());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [read]);

  useEffect(() => {
    let cancelled = false;
    read()
      .then((next) => !cancelled && setVault(next))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [read]);

  /** Crediting is the only thing this panel can ask the contract to do. */
  const credit = async () => {
    if (busy) return;
    setBusy("credit");
    setNote(null);
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "credit" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "That didn't go through.");

      if (body.vault) setVault(body.vault);
      else await refresh();

      if (body.error) {
        // Partial: some batches landed before one failed.
        setNote({ text: `${body.credited} credited, then: ${body.error}` });
      } else if (body.warning) {
        setNote({ text: body.warning });
      } else {
        setNote({
          text:
            body.credited === 0
              ? "Nothing was waiting to be credited."
              : `${body.credited} sale${body.credited === 1 ? "" : "s"} credited on-chain.`,
          hash: body.batches?.[0]?.hash || undefined,
        });
      }
      onCredited();
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : "That didn't go through." });
    } finally {
      setBusy(null);
    }
  };

  if (!PAYOUT_CONTRACT_ID) {
    return (
      <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-7 sm:p-9">
        <p className="eyebrow text-chalk-faint">Payout vault</p>
        <p className="mt-3 text-lg text-balance text-chalk">
          No payout contract configured.
        </p>
        <p className="mt-2 max-w-md text-sm text-pretty text-chalk-dim">
          Set NEXT_PUBLIC_PAYOUT_CONTRACT_ID and restart. Sales can still be
          recorded, but nothing can be credited and nobody can claim.
        </p>
      </div>
    );
  }

  const short = vault !== null && pendingStroops > vault.surplus;

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950">
      <div className="flex flex-col gap-7 p-7 sm:flex-row sm:items-start sm:justify-between sm:p-9">
        <div className="min-w-0">
          <p className="eyebrow text-chalk-faint">Payout vault</p>
          <p className="mt-3 display text-[2.5rem] font-medium tabular-nums text-chalk sm:text-[3rem]">
            {failed ? "—" : vault === null ? "…" : formatXlm(vault.funded)}
            <span className="ml-2 text-lg font-normal text-chalk-dim">XLM</span>
          </p>

          <p className="mt-3 text-sm text-pretty text-chalk-dim">
            {failed
              ? "The contract didn't answer."
              : vault === null
                ? "Reading the contract…"
                : `${formatXlm(vault.owed)} XLM is already owed to contributors and can't be taken back. ${formatXlm(vault.surplus)} XLM is free to credit against.`}
          </p>

          {vault !== null && pendingCount > 0 && (
            <p className="mt-2 text-sm text-pretty text-chalk-dim">
              {short
                ? `${formatXlm(pendingStroops)} XLM of sales is waiting and the vault is short — fund it before crediting.`
                : `${formatXlm(pendingStroops)} XLM across ${pendingCount} sale${pendingCount === 1 ? "" : "s"} is waiting to be credited.`}
            </p>
          )}

          <a
            href={explorerContractUrl(PAYOUT_CONTRACT_ID)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-chalk-faint transition-colors hover:text-chalk-dim"
          >
            {truncateAddress(PAYOUT_CONTRACT_ID, 6, 6)}
            <ExternalArrow />
          </a>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <button
            type="button"
            onClick={credit}
            disabled={busy !== null || pendingCount === 0}
            className="inline-flex items-center rounded-lg bg-chalk px-5 py-2.5 text-sm font-medium text-ink-950 transition-colors duration-200 hover:bg-paper disabled:opacity-40"
          >
            {busy === "credit"
              ? "Crediting…"
              : pendingCount === 0
                ? "Nothing to credit"
                : `Credit ${pendingCount} sale${pendingCount === 1 ? "" : "s"}`}
          </button>

          {/* No "fund the vault" control, on purpose: this server holds no
              money to move. Topping the vault up is done from outside, by
              whoever chooses to put test XLM into the contract. */}
          <button
            type="button"
            onClick={refresh}
            className="text-xs text-chalk-faint transition-colors hover:text-chalk-dim"
          >
            Refresh vault
          </button>

          {note && (
            <p className="max-w-64 text-right text-xs text-pretty text-chalk-dim">
              {note.text}{" "}
              {note.hash && (
                <a
                  href={explorerTxUrl(note.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline decoration-ink-800 underline-offset-4 hover:decoration-chalk-dim"
                >
                  {note.hash.slice(0, 8)}…
                </a>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ExternalArrow() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9.5 2.5h4v4M13.5 2.5L7 9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 3.5H4A1.5 1.5 0 002.5 5v7A1.5 1.5 0 004 13.5h7a1.5 1.5 0 001.5-1.5V9.5" strokeLinecap="round" />
    </svg>
  );
}
