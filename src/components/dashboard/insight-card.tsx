"use client";

import Link from "next/link";
import { SOURCE_RATES } from "@/lib/rates";
import { sourceLabel, type Dataset } from "@/lib/supabase/datasets";
import { Card } from "./primitives";

/**
 * The "what next" card. Rule-based, and says so: the highest-paying source
 * category the wallet hasn't contributed yet, priced from the same table the
 * projected-payout tile uses. No model, no invented numbers.
 */
export function InsightCard({ datasets }: { datasets: Dataset[] }) {
  const covered = new Set(datasets.map((d) => d.source_type));
  const next = Object.entries(SOURCE_RATES)
    .filter(([id]) => id !== "other" && !covered.has(id))
    .sort((a, b) => b[1] - a[1])[0];

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5 text-slate"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 1.5l1.6 4.9L14.5 8l-4.9 1.6L8 14.5 6.4 9.6 1.5 8l4.9-1.6L8 1.5z" />
          </svg>
          Insight
        </p>
        <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
          Rule-based
        </span>
      </div>

      {next ? (
        <>
          <p className="mt-4 text-sm font-medium text-ink">
            Cover {sourceLabel(next[0]).toLowerCase()} next.
          </p>
          <p className="mt-2 text-sm text-pretty text-ink-dim">
            It&apos;s the highest-paying category you haven&apos;t contributed
            yet — a ${next[1].toFixed(2)}/mo median payout. One dataset there
            lifts your projection.
          </p>
          <p className="mt-3 font-mono text-xs text-ink-faint">
            Projected impact: +${next[1].toFixed(2)} / mo · an estimate
          </p>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm font-medium text-ink">
            Every category covered.
          </p>
          <p className="mt-2 text-sm text-pretty text-ink-dim">
            From here, rare beats common — deeper history in the sources you
            already share earns more than another everyday one.
          </p>
        </>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/uploads"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate"
        >
          Upload a dataset
        </Link>
        <Link
          href="/#earnings"
          className="text-sm text-ink-dim transition-colors hover:text-ink"
        >
          How rates work
        </Link>
      </div>
    </Card>
  );
}
