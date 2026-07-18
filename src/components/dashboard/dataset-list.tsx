"use client";

import { formatBytes, formatDate } from "@/lib/format";
import { sourceLabel, type Dataset } from "@/lib/supabase/datasets";

/**
 * The wallet's contributed datasets. `null` means still loading; an empty
 * array means connected but nothing uploaded yet.
 */
export function DatasetList({ datasets }: { datasets: Dataset[] | null }) {
  if (datasets === null) {
    return (
      <div className="mt-4 space-y-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl border border-rule bg-paper-raised"
          />
        ))}
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-rule-strong bg-paper-raised/50 px-5 py-8 text-center text-sm text-ink-dim">
        Nothing yet. Your first upload shows up here, hash and all.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-2">
      {datasets.map((d) => (
        <li
          key={d.id}
          className="rounded-xl border border-rule bg-paper-raised p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{d.title}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.6875rem] text-ink-faint">
                <span className="rounded border border-rule bg-paper px-1.5 py-0.5">
                  {sourceLabel(d.source_type)}
                </span>
                <span>{formatBytes(d.byte_size)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatDate(d.created_at)}</span>
              </p>
            </div>
            {/* Receipt lands in a later commit; be honest it isn't signed yet. */}
            <span className="shrink-0 rounded-full border border-rule bg-paper px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-faint">
              No receipt yet
            </span>
          </div>
          {d.description && (
            <p className="mt-2 text-sm text-pretty text-ink-dim">
              {d.description}
            </p>
          )}
          <p className="mt-2 break-all font-mono text-[0.625rem] text-ink-faint">
            {d.sha256}
          </p>
        </li>
      ))}
    </ul>
  );
}
