"use client";

import { useMemo } from "react";
import { formatBytes } from "@/lib/format";
import { sourceLabel, type Dataset } from "@/lib/supabase/datasets";
import { FOLD_COLOR, SOURCE_COLORS } from "./chart-colors";

const DAY = 86_400_000;

/** Rows beyond this fold into "Other sources" rather than minting new hues. */
const MAX_ROWS = 5;

/**
 * Where the period's data came from — one labelled row per source, sorted by
 * share. The hue is fixed per source; the label and figures carry identity,
 * so the colour is reinforcement, never the message.
 */
export function SourceShare({
  datasets,
  period,
}: {
  datasets: Dataset[];
  period: number;
}) {
  const { rows, total } = useMemo(() => {
    const cutoff = Date.now() - period * DAY;
    const inPeriod = datasets.filter(
      (d) => new Date(d.created_at).getTime() >= cutoff,
    );

    const totals = new Map<string, number>();
    for (const d of inPeriod) {
      totals.set(d.source_type, (totals.get(d.source_type) ?? 0) + d.byte_size);
    }

    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const rows = sorted.slice(0, MAX_ROWS);
    const rest = sorted.slice(MAX_ROWS);
    if (rest.length > 0) {
      rows.push(["__fold", rest.reduce((sum, [, bytes]) => sum + bytes, 0)]);
    }

    return { rows, total: inPeriod.reduce((s, d) => s + d.byte_size, 0) };
  }, [datasets, period]);

  if (total === 0) {
    return (
      <p className="flex h-44 items-center justify-center rounded-xl border border-dashed border-rule-strong bg-paper-raised/50 text-center text-sm text-ink-dim">
        No uploads in the last {period} days.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map(([id, bytes]) => {
        const pct = (bytes / total) * 100;
        const fold = id === "__fold";
        const color = fold ? FOLD_COLOR : (SOURCE_COLORS[id] ?? FOLD_COLOR);
        return (
          <li key={id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate text-ink">
                  {fold ? "Other sources" : sourceLabel(id)}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-dim">
                {formatBytes(bytes)}{" "}
                <span className="text-ink-faint">{pct.toFixed(0)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-sunken">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
