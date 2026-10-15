"use client";

import { useState } from "react";
import { COS, iso, pts, SIN, type V3 } from "./iso";

export type Part = { id: string; label: string; value: number };

/** World units the total column is drawn to. Everything scales against it. */
const TALL = 150;
const SIDE = 30;

/**
 * The estimate as an isometric waterfall: one column per source the reader
 * switched on, each floating at the height everything before it reached and
 * adding its own share, then a last column holding the whole of it. Every
 * column is ruled in tenths of the total, so a source's share can be read off
 * by counting. Hovering a column (or focusing it) names its value; colour
 * never carries it.
 *
 * Drawn 520 units wide, so on a phone the 10-unit labels land at about 5px.
 * Below sm they give way to a readout line under the chart, at body size,
 * naming whichever column was last tapped.
 */
export function EarningsChart({
  parts,
  unit,
  format,
}: {
  parts: Part[];
  unit: string;
  format: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const scale = total > 0 ? TALL / total : 0;
  const columns = [...parts, { id: "total", label: "Your payout", value: total }];

  // Spread the columns across the same screen width whatever their number: a
  // step of (+t, −t) in the world moves straight right on screen.
  const width = 520;
  const step = width / Math.max(columns.length, 2);
  const t = step / (2 * COS);

  let running = 0;
  const placed = columns.map((col, i) => {
    const isTotal = col.id === "total";
    const base = isTotal ? 0 : running * scale;
    const h = Math.max(col.value * scale, 0);
    if (!isTotal) running += col.value;
    const cx = (i - (columns.length - 1) / 2) * t;
    const cy = -cx;
    return { ...col, isTotal, base, h, x: cx - SIDE / 2, y: cy - SIDE / 2 };
  });

  const ground = (x: number, y: number): [number, number] => iso([x, y, 0]);
  const [left] = ground(placed[0].x, placed[0].y + SIDE);
  const [right] = ground(placed[placed.length - 1].x + SIDE, placed[placed.length - 1].y);
  const top = -TALL - SIDE * SIN - 40;

  const picked = hover === null ? null : placed[hover];

  return (
    <div>
      <svg
        viewBox={`${left - 24} ${top} ${right - left + 48} ${-top + SIDE + 52}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Estimated payout ${format(total)} ${unit}, built from ${parts
          .map((p) => `${p.label} ${format(p.value)}`)
          .join(", ")}.`}
      >
        {placed.map((col, i) => {
          const { x, y, base, h, isTotal } = col;
          const lit = hover === null || hover === i;
          const top3: V3 = [x, y, base + h];
          const [lx, ly] = iso(top3);
          const [gx, gy] = iso([x + SIDE / 2, y + SIDE / 2, 0]);
          const rule = (z: number) =>
            pts([x, y + SIDE, z], [x + SIDE, y + SIDE, z], [x + SIDE, y, z]);
          const tenth = total > 0 ? TALL / 10 : 0;
          const rules = [];
          for (let z = tenth; z < h - 0.5 && tenth > 0; z += tenth) {
            rules.push(
              <polyline key={z} points={rule(base + z)} fill="none" className="stroke-star/25" strokeWidth="1" />,
            );
          }
          return (
            <g
              key={col.id}
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="cursor-default outline-none"
              opacity={lit ? 1 : 0.35}
              style={{ transition: "opacity 200ms" }}
            >
              {/* What the column stands on: dashed down to the ground for a
                  floating share, so the step it climbs from is visible. */}
              {!isTotal && base > 0 && (
                <polygon
                  points={pts([x, y + SIDE, 0], [x + SIDE, y + SIDE, 0], [x + SIDE, y, 0], [x + SIDE, y, base], [x + SIDE, y + SIDE, base], [x, y + SIDE, base])}
                  fill="none"
                  className="stroke-star/25"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
              )}
              {h > 0 && (
                <g
                  className={isTotal ? "stroke-star" : "stroke-star/70"}
                  fill="var(--color-night-900)"
                  strokeWidth="1"
                  strokeLinejoin="round"
                >
                  <polygon points={pts([x + SIDE, y, base], [x + SIDE, y + SIDE, base], [x + SIDE, y + SIDE, base + h], [x + SIDE, y, base + h])} />
                  <polygon points={pts([x, y + SIDE, base], [x + SIDE, y + SIDE, base], [x + SIDE, y + SIDE, base + h], [x, y + SIDE, base + h])} />
                  <polygon points={pts([x, y, base + h], [x + SIDE, y, base + h], [x + SIDE, y + SIDE, base + h], [x, y + SIDE, base + h])} />
                </g>
              )}
              {rules}
              {/* Hit area larger than the mark. */}
              <rect x={gx - step / 2} y={ly - 30} width={step} height={gy - ly + 60} fill="transparent" />
              {hover === i && h > 0 && (
                <g className="hidden sm:inline">
                  <rect x={lx + SIDE * COS - 34} y={ly - 34} width={68} height={20} rx={10} className="fill-night-800 stroke-star/30" />
                  <text x={lx + SIDE * COS} y={ly - 20} textAnchor="middle" className="fill-star font-mono text-[10px]">
                    {format(col.value)}
                  </text>
                </g>
              )}
              <text
                x={gx}
                y={gy + 30}
                textAnchor="middle"
                className={`hidden font-mono text-[10px] sm:inline ${isTotal ? "fill-star" : "fill-star-faint"}`}
              >
                {col.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p aria-hidden="true" className="mt-2 text-center font-mono text-xs text-star-dim sm:hidden">
        {picked ? (
          <>
            <span className={picked.isTotal ? "text-star" : ""}>{picked.label}</span>
            {" · "}
            <span className="text-star tabular-nums">
              {format(picked.value)} {unit}
            </span>
          </>
        ) : (
          "Tap a column to read it"
        )}
      </p>
    </div>
  );
}
