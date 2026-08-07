"use client";

import { useCallback, useEffect, useState } from "react";
import {
  explorerAccountUrl,
  formatXlm,
  TREASURY_ADDRESS,
  truncateAddress,
} from "@/lib/stellar/config";
import { fetchAccount, fundWithFriendbot } from "@/lib/stellar/horizon";

/**
 * The account every claim is paid from. An operator's first question is
 * "can we still pay people", so the balance leads, and topping it up from
 * friendbot is one click away.
 *
 * `outstandingStroops` is what contributors could claim right now — set
 * against the balance, it's the only number that answers the question
 * honestly.
 */
export function TreasuryCard({
  outstandingStroops,
}: {
  outstandingStroops: number;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [exists, setExists] = useState(true);
  const [failed, setFailed] = useState(false);
  const [funding, setFunding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Re-read the balance after a top-up, or on demand. */
  const refresh = useCallback(async () => {
    if (!TREASURY_ADDRESS) return;
    try {
      const account = await fetchAccount(TREASURY_ADDRESS);
      setBalance(account.balanceStroops);
      setExists(account.exists);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!TREASURY_ADDRESS) return;
    let cancelled = false;
    fetchAccount(TREASURY_ADDRESS)
      .then((account) => {
        if (cancelled) return;
        setBalance(account.balanceStroops);
        setExists(account.exists);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const fund = async () => {
    setFunding(true);
    setError(null);
    try {
      await fundWithFriendbot(TREASURY_ADDRESS);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Funding failed.");
    } finally {
      setFunding(false);
    }
  };

  if (!TREASURY_ADDRESS) {
    return (
      <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-7 sm:p-9">
        <p className="eyebrow text-chalk-faint">Treasury</p>
        <p className="mt-3 text-lg text-balance text-chalk">
          No payout account configured.
        </p>
        <p className="mt-2 max-w-md text-sm text-pretty text-chalk-dim">
          Set NEXT_PUBLIC_STELLAR_TREASURY and STELLAR_TREASURY_SECRET, then
          restart. Sales can still be recorded, but nobody can claim one.
        </p>
      </div>
    );
  }

  const short = balance !== null && balance < outstandingStroops;

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950">
      <div className="flex flex-col gap-7 p-7 sm:flex-row sm:items-start sm:justify-between sm:p-9">
        <div>
          <p className="eyebrow text-chalk-faint">Treasury</p>
          <p className="mt-3 display text-[2.5rem] font-medium tabular-nums text-chalk sm:text-[3rem]">
            {failed ? "—" : balance === null ? "…" : formatXlm(balance)}
            <span className="ml-2 text-lg font-normal text-chalk-dim">XLM</span>
          </p>

          <p className="mt-3 text-sm text-chalk-dim">
            {failed
              ? "Horizon didn't answer."
              : !exists
                ? "This account doesn't exist on testnet yet — fund it to open it."
                : short
                  ? `Short of the ${formatXlm(outstandingStroops)} XLM contributors can claim right now.`
                  : `Covers the ${formatXlm(outstandingStroops)} XLM contributors can claim right now.`}
          </p>

          <a
            href={explorerAccountUrl(TREASURY_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-chalk-faint transition-colors hover:text-chalk-dim"
          >
            {truncateAddress(TREASURY_ADDRESS, 6, 6)}
            <svg
              viewBox="0 0 16 16"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M9.5 2.5h4v4M13.5 2.5L7 9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 3.5H4A1.5 1.5 0 002.5 5v7A1.5 1.5 0 004 13.5h7a1.5 1.5 0 001.5-1.5V9.5" strokeLinecap="round" />
            </svg>
          </a>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <button
            type="button"
            onClick={fund}
            disabled={funding}
            className="inline-flex items-center rounded-lg bg-chalk px-5 py-2.5 text-sm font-medium text-ink-950 transition-colors duration-200 hover:bg-paper disabled:opacity-70"
          >
            {funding ? "Funding…" : "Top up with friendbot"}
          </button>
          <button
            type="button"
            onClick={refresh}
            className="text-xs text-chalk-faint transition-colors hover:text-chalk-dim"
          >
            Refresh balance
          </button>
          {error && (
            <p className="max-w-56 text-right text-xs text-pretty text-chalk-dim">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
