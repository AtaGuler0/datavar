"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";

export type CurvePoint = { t: number; value: number };

/**
 * A cumulative series drawn as a line over a soft fill — the counterpart to
 * the column chart, for quantities that only ever go up. Same recessive grid
 * and dark tooltip as the rest of the dashboard.
 *
 * The viewBox is stretched to the container (`preserveAspectRatio="none"`),
 * so every stroke carries `vector-effect="non-scaling-stroke"` and stays an
 * even weight at any width.
 */
export function GrowthCurve({
  points,
  format,
  unitLabel,
}: {
  points: CurvePoint[];
  format: (value: number) => string;
  /** Plural noun for the tooltip and the screen-reader table, e.g. "contributors". */
  unitLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const values = points.map((p) => p.value);
  const max = Math.max(...values);

  if (points.length < 2 || max === 0) {
    return (
      <p className="flex h-44 items-center justify-center rounded-xl border border-dashed border-rule-strong bg-paper-raised/50 text-center text-sm text-ink-dim">
        Not enough history to plot yet.
      </p>
    );
  }

  // Band the curve rather than zeroing it: growth from 4.3K to 6.6K is the
  // story, and a floor at zero would flatten it into a straight line.
  const low = Math.min(...values);
  const floor = low === max ? Math.max(low - 1, 0) : low - (max - low) * 0.15;
  const span = max - floor || 1;

  const W = 320;
  const H = 160;
  // Vertical inset so a series pinned at its own maximum — a flat line, or
  // the last point of a rising one — isn't sliced in half by the top edge.
  const PAD = 4;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) =>
    H - PAD - ((v - floor) / span) * (H - PAD * 2);

  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)} ${y(p.value).toFixed(2)}`)
    .join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;

  const last = points[points.length - 1];
  const hovered = hover === null ? null : points[hover];
  const shift =
    hover === null
      ? "-50%"
      : hover < 2
        ? "0%"
        : hover > points.length - 3
          ? "-100%"
          : "-50%";

  return (
    <div>
      <div className="relative h-44">
        {/* Recessive grid: top and midpoint of the banded range. */}
        {[1, 0.5].map((f) => (
          <div
            key={f}
            className="absolute inset-x-0 border-t border-rule"
            style={{ top: `${(1 - f) * 100}%` }}
          >
            <span className="absolute right-0 top-0.5 font-mono text-[0.625rem] text-ink-faint">
              {format(floor + span * f)}
            </span>
          </div>
        ))}

        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <path d={area} fill="var(--color-slate)" fillOpacity="0.08" />
          <path
            d={line}
            fill="none"
            stroke="var(--color-slate)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {hovered && (
            <line
              x1={x(hover!)}
              y1="0"
              x2={x(hover!)}
              y2={H}
              stroke="var(--color-rule-strong)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Current position, pinned in page pixels so it stays a circle. */}
        <span
          className="pointer-events-none absolute -ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full bg-slate"
          style={{
            left: "100%",
            top: `${((y(last.value) / H) * 100).toFixed(2)}%`,
          }}
        />

        <div className="absolute inset-x-0 bottom-0 border-t border-rule-strong" />

        {/* Hit targets: one invisible column per point. */}
        <div className="absolute inset-0 flex">
          {points.map((p, i) => (
            <div
              key={p.t}
              className="h-full flex-1"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </div>

        {hovered && (
          <div
            className="pointer-events-none absolute -top-2 z-10 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs whitespace-nowrap shadow-lg shadow-ink/10"
            style={{
              left: `${((hover! + 0.5) / points.length) * 100}%`,
              transform: `translateX(${shift})`,
            }}
          >
            <p className="font-mono text-[0.625rem] text-chalk-faint">
              {formatDate(new Date(hovered.t).toISOString())}
            </p>
            <p className="mt-1 font-medium text-chalk">
              {format(hovered.value)}
              <span className="ml-1.5 font-normal text-chalk-dim">
                {unitLabel}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between font-mono text-[0.625rem] text-ink-faint">
        <span>{formatDate(new Date(points[0].t).toISOString())}</span>
        <span>Today</span>
      </div>

      <table className="sr-only">
        <caption>Cumulative {unitLabel} over time</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.t}>
              <td>{formatDate(new Date(p.t).toISOString())}</td>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
