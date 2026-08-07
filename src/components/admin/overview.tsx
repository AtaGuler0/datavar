"use client";

import Link from "next/link";
import { formatCount } from "@/lib/format";
import { formatXlm } from "@/lib/stellar/config";
import { Card } from "@/components/dashboard/primitives";
import { StatCard } from "@/components/dashboard/stat-card";
import { SalesTable } from "./sales-table";
import { TreasuryCard } from "./treasury-card";
import { marketTotals, useMarket } from "./use-market";

const RECENT_ROWS = 6;

/**
 * The operator's first screen: can we pay, what have we sold, what do we owe.
 * Everything here is a standing total — the admin panel has no period control,
 * because an operator asks "where do we stand", not "how did the week go".
 */
export function AdminOverview() {
  const { datasets, sales, failed } = useMarket();

  if (failed) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-rule-strong bg-paper/60 px-6 py-12 text-center">
        <p className="text-sm text-ink-dim">
          The market tables are unavailable right now.
        </p>
      </div>
    );
  }

  if (!datasets || !sales) {
    return (
      <div className="mt-10 space-y-3">
        <div className="h-52 animate-pulse rounded-2xl border border-rule bg-paper-raised" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-rule bg-paper-raised"
            />
          ))}
        </div>
      </div>
    );
  }

  const totals = marketTotals(datasets, sales);

  return (
    <div className="mt-10">
      <TreasuryCard outstandingStroops={totals.outstanding} />

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Owed to contributors"
          value={`${formatXlm(totals.outstanding)} XLM`}
          footnote="sold but not yet claimed"
        />
        <StatCard
          label="Paid out"
          value={`${formatXlm(totals.claimed)} XLM`}
          footnote={`to ${formatCount(totals.paidContributors)} contributor${totals.paidContributors === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Gross sold"
          value={`${formatXlm(totals.gross)} XLM`}
          footnote={`across ${formatCount(totals.sales)} sale${totals.sales === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Datasets on file"
          value={formatCount(totals.datasets)}
          footnote={`from ${formatCount(totals.contributors)} contributor${totals.contributors === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Datasets sold"
          value={`${formatCount(totals.sold)} of ${formatCount(totals.datasets)}`}
          footnote="licensed at least once"
        />
        <StatCard
          label="Average sale"
          value={
            totals.sales
              ? `${formatXlm(Math.round(totals.gross / totals.sales))} XLM`
              : "—"
          }
          footnote="mean price a dataset went for"
        />
      </div>

      <div className="mt-3">
        <Card
          title="Latest sales"
          subtitle="Newest first, across every contributor"
          action={
            <Link
              href="/admin/sales"
              className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-ink"
            >
              Full ledger
              <svg
                viewBox="0 0 16 16"
                className="h-3 w-3 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M6 3l5 5-5 5" strokeLinecap="round" />
              </svg>
            </Link>
          }
        >
          <SalesTable
            sales={sales.slice(0, RECENT_ROWS)}
            emptyLabel="No sales yet. Run a round from the Sales page."
          />
        </Card>
      </div>
    </div>
  );
}
