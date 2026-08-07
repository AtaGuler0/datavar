"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
 * something actually settles on-chain. Each row is a dataset a buyer licensed;
 * claiming one asks the server to pay it out in test XLM and comes back with a
 * transaction hash the contributor can check for themselves.
 */
export function EarningsPanel() {
  const { address } = useWallet();

  const [loaded, setLoaded] = useState<{
    wallet: string;
    rows: SaleWithDataset[];
  } | null>(null);
  const [failed, setFailed] = useState(false);
  // Which sale is mid-claim, and the last claim error worth showing.
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Refetch after a claim — the server owns the row's final shape. */
  const load = useCallback((wallet: string) => {
    return listSalesForWallet(wallet)
      .then((rows) => setLoaded({ wallet, rows }))
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    listSalesForWallet(address)
      .then((rows) => !cancelled && setLoaded({ wallet: address, rows }))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Keyed by wallet, like the overview — a switched account never shows the
  // previous one's payouts while the new ones load.
  const sales = address && loaded?.wallet === address ? loaded.rows : null;

  const totals = useMemo(() => {
    if (!sales) return null;
    const unclaimed = sales.filter((s) => s.status === "unclaimed");
    const claimed = sales.filter((s) => s.status === "claimed");
    return {
      claimable: totalStroops(unclaimed),
      claimableCount: unclaimed.length,
      paid: totalStroops(claimed),
      paidCount: claimed.length,
      lifetime: totalStroops(sales),
      buyers: new Set(sales.map((s) => s.buyer)).size,
    };
  }, [sales]);

  const claim = async (sale: SaleWithDataset) => {
    if (!address || claiming) return;
    setClaiming(sale.id);
    setError(null);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId: sale.id, wallet: address }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "The payout didn't go through.");
      await load(address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payout didn't go through.");
    } finally {
      setClaiming(null);
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
          value={`${formatXlm(totals.claimable)} XLM`}
          footnote={
            totals.claimableCount === 0
              ? "nothing waiting"
              : `across ${totals.claimableCount} sale${totals.claimableCount === 1 ? "" : "s"}`
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

      {error && (
        <p className="mt-3 rounded-xl border border-rule bg-paper px-4 py-3 text-sm text-ink-dim">
          {error}
        </p>
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
          {sales.length === 0 ? (
            <EmptySales />
          ) : (
            <SalesTable
              sales={sales}
              claimingId={claiming}
              onClaim={claim}
              busy={!!claiming}
            />
          )}
        </Card>
      </div>

      <p className="mt-4 text-xs text-pretty text-ink-faint">
        Buyers are simulated while the demand side of the protocol is built —
        prices are placeholders. The payout is not: claiming settles a real
        payment on Stellar testnet, and every hash below is public.
      </p>
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
        href="/dashboard/uploads"
        className="mt-5 inline-flex items-center rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate"
      >
        Upload a dataset
      </Link>
    </div>
  );
}

/** The ledger proper: what sold, to whom, for how much, and where it settled. */
function SalesTable({
  sales,
  claimingId,
  onClaim,
  busy,
}: {
  sales: SaleWithDataset[];
  claimingId: string | null;
  onClaim: (sale: SaleWithDataset) => void;
  busy: boolean;
}) {
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
                <span className="block truncate font-medium text-ink">
                  {sale.datasets?.title ?? "Deleted dataset"}
                </span>
                {sale.datasets && (
                  <span className="mt-0.5 block truncate text-xs text-ink-faint">
                    {sourceLabel(sale.datasets.source_type)}
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
                <PayoutCell
                  sale={sale}
                  claiming={claimingId === sale.id}
                  disabled={busy}
                  onClaim={onClaim}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The right-hand column carries the row's whole state: claim it, watch it
 * settle, then read the hash it settled as.
 */
function PayoutCell({
  sale,
  claiming,
  disabled,
  onClaim,
}: {
  sale: SaleWithDataset;
  claiming: boolean;
  disabled: boolean;
  onClaim: (sale: SaleWithDataset) => void;
}) {
  if (sale.status === "claimed") {
    return sale.tx_hash ? (
      <a
        href={explorerTxUrl(sale.tx_hash)}
        target="_blank"
        rel="noreferrer"
        className="group inline-flex items-center gap-1.5 font-mono text-xs text-ink-dim transition-colors hover:text-ink"
        title={sale.tx_hash}
      >
        {sale.tx_hash.slice(0, 8)}…
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
    ) : (
      <span className="font-mono text-xs text-ink-faint">Paid</span>
    );
  }

  if (sale.status === "claiming" || claiming) {
    return (
      <span className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-faint">
        Settling…
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClaim(sale)}
      disabled={disabled}
      className="inline-flex items-center rounded-lg bg-slate-deep px-3.5 py-1.5 text-xs font-medium text-paper transition-colors duration-200 hover:bg-slate disabled:opacity-50"
    >
      Claim
    </button>
  );
}
