"use client";

import { useMemo, useState } from "react";
import { formatBytes, formatDate } from "@/lib/format";
import type { Dataset } from "@/lib/supabase/datasets";

const DAY = 86_400_000;

type Bucket = { from: number; to: number; bytes: number; count: number };

/**
 * Data contributed over the selected period as a single-series column chart —
 * one bar per day (per ~week at 90 days), in the brand slate. Identity by
 * source lives next door in the share card; this one only answers "when".
 */
export function ActivityChart({
  datasets,
  period,
}: {
  datasets: Dataset[];
  period: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const { buckets, max, weekly } = useMemo(() => {
    const weekly = period === 90;
    const n = weekly ? 13 : period;
    const now = Date.now();
    const size = (period * DAY) / n;
    const buckets: Bucket[] = Array.from({ length: n }, (_, i) => {
      const from = now - period * DAY + i * size;
      const to = from + size;
      const inBucket = datasets.filter((d) => {
        const t = new Date(d.created_at).getTime();
        return t >= from && t < to;
      });
      return {
        from,
        to,
        bytes: inBucket.reduce((sum, d) => sum + d.byte_size, 0),
        count: inBucket.length,
      };
    });
    return { buckets, max: Math.max(...buckets.map((b) => b.bytes)), weekly };
  }, [datasets, period]);

  if (max === 0) {
    return (
      <p className="flex h-44 items-center justify-center rounded-xl border border-dashed border-rule-strong bg-paper-raised/50 text-center text-sm text-ink-dim">
        No uploads in the last {period} days.
      </p>
    );
  }

  const hovered = hover === null ? null : buckets[hover];
  const iso = (t: number) => new Date(t).toISOString();
  // Keep the tooltip inside the card at the edges.
  const shift =
    hover === null
      ? "-50%"
      : hover < 2
        ? "0%"
        : hover > buckets.length - 3
          ? "-100%"
          : "-50%";

  return (
    <div>
      <div className="relative h-44">
        {/* Recessive grid: max and midpoint, labelled faintly on the right. */}
        {[1, 0.5].map((f) => (
          <div
            key={f}
            className="absolute inset-x-0 border-t border-rule"
            style={{ top: `${(1 - f) * 100}%` }}
          >
            <span className="absolute right-0 top-0.5 font-mono text-[0.625rem] text-ink-faint">
              {formatBytes(max * f)}
            </span>
          </div>
        ))}

        <div className="absolute inset-0 flex items-end gap-1 pt-3">
          {buckets.map((b, i) => (
            // The whole column is the hit target; the bar is just the mark.
            <div
              key={i}
              className="flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {b.bytes > 0 && (
                <div
                  className={`w-full rounded-t-[4px] transition-colors duration-150 ${
                    hover === i ? "bg-slate-deep" : "bg-slate"
                  }`}
                  style={{ height: `max(${(b.bytes / max) * 100}%, 3px)` }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t border-rule-strong" />

        {hovered && hovered.count > 0 && (
          <div
            className="pointer-events-none absolute -top-2 z-10 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs whitespace-nowrap shadow-lg shadow-ink/10"
            style={{
              left: `${((hover! + 0.5) / buckets.length) * 100}%`,
              transform: `translateX(${shift})`,
            }}
          >
            <p className="font-mono text-[0.625rem] text-chalk-faint">
              {formatDate(iso(hovered.from))}
              {weekly && <> – {formatDate(iso(hovered.to - 1))}</>}
            </p>
            <p className="mt-1 font-medium text-chalk">
              {formatBytes(hovered.bytes)}
              <span className="ml-1.5 font-normal text-chalk-dim">
                · {hovered.count} upload{hovered.count === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between font-mono text-[0.625rem] text-ink-faint">
        <span>{formatDate(iso(buckets[0].from))}</span>
        <span>Today</span>
      </div>

      {/* The same numbers as text, for screen readers. */}
      <table className="sr-only">
        <caption>
          Data contributed per {weekly ? "week" : "day"}, last {period} days
        </caption>
        <thead>
          <tr>
            <th>Starting</th>
            <th>Bytes</th>
            <th>Uploads</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b, i) => (
            <tr key={i}>
              <td>{formatDate(iso(b.from))}</td>
              <td>{formatBytes(b.bytes)}</td>
              <td>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
