"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authHeaders } from "@/lib/auth/session-store";
import { formatDate } from "@/lib/format";
import {
  explorerTxUrl,
  formatXlm,
  truncateAddress,
} from "@/lib/stellar/config";
import { sourceLabel } from "@/lib/supabase/datasets";
import {
  listSalesForWallet,
  totalStroops,
  type SaleWithDataset,
} from "@/lib/supabase/sales";
import { Card } from "./primitives";
import { StatCard } from "./stat-card";
import { useWallet } from "./wallet-provider";

/**
 * The payout ledger, and the one place in the contributor dashboard where
 * something actually settles on-chain.
 *
 * What a claim is here: earnings sit in the payout contract, credited to this
 * wallet, and claiming signs a transaction that moves them out. The server
 * builds it and relays it but cannot sign it — which is the point. Nobody can
 * claim this wallet's balance except this wallet, and nobody can stop it.
 */
export function EarningsPanel() {
  const { address, signTransaction } = useWallet();

  const [loaded, setLoaded] = useState<{
    wallet: string;
    rows: SaleWithDataset[];
    /** Stroops the payout contract holds for this wallet. Null while unread. */
    vault: number | null;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState<string | null>(null);

  /**
   * Sales come from the database; the claimable balance comes from the
   * contract. Read together, because a row that says "credited" is only true if
   * the ledger agrees — and the ledger is the one that pays.
   */
  const load = useCallback(async (wallet: string) => {
    const [rows, vault] = await Promise.all([
      listSalesForWallet(wallet),
      fetch(`/api/payouts?wallet=${wallet}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => (typeof body?.balance === "number" ? body.balance : null))
        .catch(() => null),
    ]);
    return { wallet, rows, vault };
  }, []);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    load(address)
      .then((next) => !cancelled && setLoaded(next))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [address, load]);

  // Keyed by wallet, like the overview — a switched account never shows the
  // previous one's payouts while the new ones load.
  const state = address && loaded?.wallet === address ? loaded : null;
  const sales = state?.rows ?? null;

  const totals = useMemo(() => {
    if (!sales) return null;
    const unclaimed = sales.filter((s) => s.status === "unclaimed");
    const claimed = sales.filter((s) => s.status === "claimed");
    const waiting = unclaimed.filter((s) => !s.credited_at);
    return {
      inVault: unclaimed.filter((s) => s.credited_at).length,
      waiting: waiting.length,
      waitingStroops: totalStroops(waiting),
      paid: totalStroops(claimed),
      paidCount: claimed.length,
      lifetime: totalStroops(sales),
      buyers: new Set(sales.map((s) => s.buyer)).size,
    };
  }, [sales]);

  const claimable = state?.vault ?? 0;

  const claim = async () => {
    if (!address || claiming || claimable <= 0) return;
    setClaiming(true);
    setError(null);
    setSettled(null);
    try {
      // The server prepares the call and the contract checks the signature, so
      // the wallet claimed for is the wallet that signs — not whatever this
      // request says.
      const prepared = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "build" }),
      });
      const built = await prepared.json();
      if (!prepared.ok) throw new Error(built?.error ?? "Couldn't prepare the claim.");

      const signed = await signTransaction(built.xdr);

      const sent = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "submit", xdr: signed }),
      });
      const result = await sent.json();
      if (!sent.ok) throw new Error(result?.error ?? "The claim didn't go through.");

      setSettled(result.hash);
      if (result.warning) setError(result.warning);
      setLoaded(await load(address));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The claim didn't go through.",
      );
    } finally {
      setClaiming(false);
    }
  };

  if (failed) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-rule-strong bg-paper/60 px-6 py-12 text-center">
        <p className="text-sm text-ink-dim">
          Your payouts are unavailable right now.
        </p>
      </div>
    );
  }

  if (!sales || !totals) {
    return (
      <div className="mt-10 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-rule bg-paper-raised"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-rule bg-paper-raised" />
      </div>
    );
  }

  return (
    <div className="mt-10">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Available to claim"
          value={`${formatXlm(claimable)} XLM`}
          footnote={
            state?.vault === null
              ? "the payout contract is unreachable"
              : claimable === 0
                ? "nothing in the contract for you"
                : `held in the contract, across ${totals.inVault} sale${totals.inVault === 1 ? "" : "s"}`
          }
        />
        <StatCard
          label="Paid out"
          value={`${formatXlm(totals.paid)} XLM`}
          footnote={`${totals.paidCount} payout${totals.paidCount === 1 ? "" : "s"} settled on-chain`}
        />
        <StatCard
          label="Lifetime earned"
          value={`${formatXlm(totals.lifetime)} XLM`}
          footnote="every sale of your data to date"
        />
        <StatCard
          label="Buyers"
          value={String(totals.buyers)}
          footnote="teams that have licensed your data"
        />
      </div>

      <ClaimBar
        claimable={claimable}
        waitingStroops={totals.waitingStroops}
        waitingCount={totals.waiting}
        claiming={claiming}
        onClaim={claim}
      />

      {(error || settled) && (
        <div className="mt-3 rounded-xl border border-rule bg-paper px-4 py-3 text-sm text-ink-dim">
          {settled && (
            <p>
              Claimed.{" "}
              <a
                href={explorerTxUrl(settled)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
              >
                {settled.slice(0, 12)}…
              </a>
            </p>
          )}
          {error && <p className={settled ? "mt-1.5" : undefined}>{error}</p>}
        </div>
      )}

      <div className="mt-3">
        <Card
          title="Sales"
          subtitle="Every dataset of yours a buyer has licensed"
          action={
            <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
              {truncateAddress(address ?? "")}
            </span>
          }
        >
          {sales.length === 0 ? <EmptySales /> : <SalesTable sales={sales} />}
        </Card>
      </div>

      <p className="mt-4 text-xs text-pretty text-ink-faint">
        Buyers are simulated while the demand side of the protocol is built —
        prices are placeholders. The payout is not: your earnings are held in a
        contract on Stellar testnet, and only your wallet can move them out.
      </p>
    </div>
  );
}

/**
 * The claim itself, given its own row rather than a button per sale: the
 * contract holds one balance per wallet, so there is one thing to claim and one
 * signature to give.
 */
function ClaimBar({
  claimable,
  waitingStroops,
  waitingCount,
  claiming,
  onClaim,
}: {
  claimable: number;
  waitingStroops: number;
  waitingCount: number;
  claiming: boolean;
  onClaim: () => void;
}) {
  const nothing = claimable <= 0;

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-rule bg-paper-raised px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-ink">
          {nothing
            ? "Nothing to claim right now."
            : `${formatXlm(claimable)} XLM is yours to withdraw.`}
        </p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {waitingCount > 0
            ? `${formatXlm(waitingStroops)} XLM from ${waitingCount} newer sale${waitingCount === 1 ? "" : "s"} is still being written to the contract.`
            : "Claiming signs one transaction with your wallet. The contract pays it out."}
        </p>
      </div>
      <button
        type="button"
        onClick={onClaim}
        disabled={nothing || claiming}
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate disabled:opacity-40"
      >
        {claiming ? "Waiting for your wallet…" : "Claim"}
      </button>
    </div>
  );
}

function EmptySales() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-rule-strong bg-paper-raised/50 px-6 py-12 text-center">
      <p className="text-sm text-ink-dim">
        Nothing sold yet. Payouts appear here the moment a buyer licenses one of
        your datasets.
      </p>
      <Link
        href="/dashboard/data"
        className="mt-5 inline-flex items-center rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate"
      >
        Upload a dataset
      </Link>
    </div>
  );
}

/** The ledger proper: what sold, to whom, for how much, and where it settled. */
function SalesTable({ sales }: { sales: SaleWithDataset[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
            <th className="pb-2.5 pr-4 font-normal">Dataset</th>
            <th className="pb-2.5 pr-4 font-normal">Buyer</th>
            <th className="pb-2.5 pr-4 text-right font-normal">Sold</th>
            <th className="pb-2.5 pr-4 text-right font-normal">Price</th>
            <th className="pb-2.5 text-right font-normal">Payout</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id} className="border-t border-rule">
              <td className="max-w-56 py-3 pr-4">
                {/* Back to the dataset this payout came from — the same row
                    that offered the consent it was licensed under. */}
                {sale.datasets ? (
                  <Link
                    href={`/dashboard/data#dataset-${sale.dataset_id}`}
                    className="group block min-w-0"
                  >
                    <span className="block truncate font-medium text-ink transition-colors group-hover:text-slate">
                      {sale.datasets.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-faint">
                      {sourceLabel(sale.datasets.source_type)}
                    </span>
                  </Link>
                ) : (
                  <span className="block truncate font-medium text-ink">
                    Deleted dataset
                  </span>
                )}
              </td>
              <td className="py-3 pr-4 whitespace-nowrap text-ink-dim">
                {sale.buyer}
              </td>
              <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums whitespace-nowrap text-ink-dim">
                {formatDate(sale.created_at)}
              </td>
              <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums whitespace-nowrap text-ink">
                {formatXlm(sale.price_stroops)} XLM
              </td>
              <td className="py-3 text-right whitespace-nowrap">
                <PayoutCell sale={sale} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The right-hand column carries where this sale's money is: on its way to the
 * contract, sitting in it, or already paid out — each with the hash that proves
 * it where there is one.
 */
function PayoutCell({ sale }: { sale: SaleWithDataset }) {
  if (sale.status === "claimed") {
    return sale.tx_hash ? (
      <TxLink hash={sale.tx_hash} />
    ) : (
      <span className="font-mono text-xs text-ink-faint">Paid</span>
    );
  }

  if (sale.credited_at) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-dim">
          In the contract
        </span>
        {sale.credit_tx && <TxLink hash={sale.credit_tx} muted />}
      </span>
    );
  }

  return (
    <span className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-faint">
      Being credited…
    </span>
  );
}

function TxLink({ hash, muted = false }: { hash: string; muted?: boolean }) {
  return (
    <a
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className={`group inline-flex items-center gap-1.5 font-mono text-xs transition-colors ${
        muted ? "text-ink-faint hover:text-ink-dim" : "text-ink-dim hover:text-ink"
      }`}
      title={hash}
    >
      {hash.slice(0, 8)}…
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3 text-ink-faint transition-colors group-hover:text-ink-dim"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M6.5 3.5H4A1.5 1.5 0 002.5 5v7A1.5 1.5 0 004 13.5h7a1.5 1.5 0 001.5-1.5V9.5" strokeLinecap="round" />
        <path d="M9.5 2.5h4v4M13.5 2.5L7 9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
