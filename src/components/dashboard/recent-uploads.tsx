"use client";

import Link from "next/link";
import { formatBytes, formatDate } from "@/lib/format";
import { sourceLabel, type Dataset } from "@/lib/supabase/datasets";
import { FOLD_COLOR, SOURCE_COLORS } from "./chart-colors";

const MAX_ROWS = 6;

/**
 * The latest contributions as a proper table — the same source dot the share
 * card uses, size and date in mono columns, and an honest receipt status
 * until signing exists. Everything else lives on the uploads page.
 */
export function RecentUploads({ datasets }: { datasets: Dataset[] }) {
  const rows = datasets.slice(0, MAX_ROWS); // listDatasets orders newest first

  if (rows.length === 0) {
    return (
      <p className="flex h-44 items-center justify-center rounded-xl border border-dashed border-rule-strong bg-paper-raised/50 text-center text-sm text-ink-dim">
        Nothing yet — your first upload starts the ledger.
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
              <th className="pb-2.5 pr-4 font-normal">Dataset</th>
              <th className="pb-2.5 pr-4 font-normal">Source</th>
              <th className="pb-2.5 pr-4 text-right font-normal">Size</th>
              <th className="pb-2.5 pr-4 text-right font-normal">Uploaded</th>
              <th className="pb-2.5 text-right font-normal">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-rule">
                <td className="max-w-56 truncate py-3 pr-4 font-medium text-ink">
                  {d.title}
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <span className="flex items-center gap-2 text-ink-dim">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          SOURCE_COLORS[d.source_type] ?? FOLD_COLOR,
                      }}
                    />
                    {sourceLabel(d.source_type)}
                  </span>
                </td>
                <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums whitespace-nowrap text-ink-dim">
                  {formatBytes(d.byte_size)}
                </td>
                <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums whitespace-nowrap text-ink-dim">
                  {formatDate(d.created_at)}
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  <span className="rounded-full border border-rule bg-paper-raised/60 px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-faint">
                    No receipt yet
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-1 border-t border-rule pt-3.5">
        <Link
          href="/dashboard/uploads"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink"
        >
          View all uploads
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
      </div>
    </div>
  );
}
