"use client";

import { formatDate } from "@/lib/format";
import {
  explorerTxUrl,
  formatXlm,
  truncateAddress,
} from "@/lib/stellar/config";
import { sourceLabel } from "@/lib/supabase/datasets";
import type { SaleWithDataset } from "@/lib/supabase/sales";

/**
 * The operator's view of the ledger: what sold, whose it was, and whether the
 * payout has settled. Unlike the contributor's table there's nothing to press
 * — an admin records sales, contributors claim them.
 */
export function SalesTable({
  sales,
  emptyLabel,
}: {
  sales: SaleWithDataset[];
  emptyLabel: string;
}) {
  if (sales.length === 0) {
    return (
      <p className="flex h-44 items-center justify-center rounded-xl border border-dashed border-rule-strong bg-paper-raised/50 px-6 text-center text-sm text-ink-dim">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
            <th className="pb-2.5 pr-4 font-normal">Dataset</th>
            <th className="pb-2.5 pr-4 font-normal">Contributor</th>
            <th className="pb-2.5 pr-4 font-normal">Buyer</th>
            <th className="pb-2.5 pr-4 text-right font-normal">Sold</th>
            <th className="pb-2.5 pr-4 text-right font-normal">Price</th>
            <th className="pb-2.5 text-right font-normal">Payout</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id} className="border-t border-rule">
              <td className="max-w-48 py-3 pr-4">
                <span className="block truncate font-medium text-ink">
                  {sale.datasets?.title ?? "Deleted dataset"}
                </span>
                {sale.datasets && (
                  <span className="mt-0.5 block truncate text-xs text-ink-faint">
                    {sourceLabel(sale.datasets.source_type)}
                  </span>
                )}
              </td>
              <td className="py-3 pr-4 font-mono text-xs tabular-nums whitespace-nowrap text-ink-dim">
                {truncateAddress(sale.owner_wallet)}
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
                <PayoutStatus sale={sale} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Claimed rows link out to the transaction; the rest just say where they are. */
function PayoutStatus({ sale }: { sale: SaleWithDataset }) {
  if (sale.status === "claimed" && sale.tx_hash) {
    return (
      <a
        href={explorerTxUrl(sale.tx_hash)}
        target="_blank"
        rel="noreferrer"
        title={sale.tx_hash}
        className="group inline-flex items-center gap-1.5 font-mono text-xs text-ink-dim transition-colors hover:text-ink"
      >
        {sale.tx_hash.slice(0, 8)}…
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3 text-ink-faint transition-colors group-hover:text-ink-dim"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M9.5 2.5h4v4M13.5 2.5L7 9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6.5 3.5H4A1.5 1.5 0 002.5 5v7A1.5 1.5 0 004 13.5h7a1.5 1.5 0 001.5-1.5V9.5" strokeLinecap="round" />
        </svg>
      </a>
    );
  }

  const label =
    sale.status === "claimed"
      ? "Paid"
      : sale.status === "claiming"
        ? "Settling"
        : "Unclaimed";

  return (
    <span className="rounded-full border border-rule bg-paper-raised/60 px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-faint">
      {label}
    </span>
  );
}
