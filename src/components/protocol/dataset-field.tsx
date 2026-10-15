import type { CSSProperties } from "react";
import { iso, pts, type V3 } from "../iso";

/**
 * Every dataset on file as one block on an isometric field, in the order
 * they arrived: a flat tile for one that is on file, a raised block for one a
 * buyer has licensed. The share of the field standing up is the share of the
 * protocol's data that has sold, readable without a number, and the two
 * labels give the numbers anyway.
 */

const PITCH = 14;
const SIDE = 10;
const FLAT = 2;
const RAISED = 15;

export function DatasetField({
  units,
  total,
  sold,
}: {
  units: { sold: boolean }[];
  /** The real counts, which can run past the drawn units. */
  total: number;
  sold: number;
}) {
  const n = Math.max(units.length, 1);
  // A field a little deeper than it is wide reads as a plot of land rather
  // than a strip, and keeps the drawing about as wide as the plate.
  const cols = Math.ceil(Math.sqrt(n * 1.15));
  const rows = Math.ceil(n / cols);

  const placed = units.map((u, i) => ({
    ...u,
    x: (i % cols) * PITCH,
    y: Math.floor(i / cols) * PITCH,
  }));
  // Painter's order: farthest first, so nearer blocks cover the ones behind.
  const order = [...placed].sort((a, b) => a.x + a.y - (b.x + b.y));

  const firstSold = placed.find((p) => p.sold);
  const lastFlat = [...placed].reverse().find((p) => !p.sold);

  const W = cols * PITCH;
  const D = rows * PITCH;
  const [left] = iso([0, D, 0]);
  const [right] = iso([W, 0, 0]);
  const [, top] = iso([0, 0, RAISED]);
  const [, bottom] = iso([W, D, 0]);
  const padX = 250;
  const vb = `${left - padX} ${top - 70} ${right - left + padX * 2} ${bottom - top + 110}`;

  // Half the drawing's width is room for the two callouts. Below sm they move
  // under the field as text, so the svg is widened and shifted until only the
  // field (and a hair either side) is inside the frame: it fills a phone's
  // width instead of scrolling sideways to show its own margin.
  const margin = 12;
  const windowW = right - left + margin * 2;
  const crop = {
    "--zoom": ((right - left + padX * 2) / windowW).toFixed(4),
    "--shift": ((padX - margin) / windowW).toFixed(4),
  } as CSSProperties;

  return (
    <>
      <svg
        viewBox={vb}
        style={crop}
        className="block h-auto max-w-none max-sm:ml-[calc(-100%*var(--shift))] max-sm:w-[calc(100%*var(--zoom))] sm:w-full sm:min-w-[640px]"
        role="img"
        aria-label={`${total} datasets on file, ${sold} of them licensed at least once.`}
      >
        {/* The plot they stand on. */}
        <polygon
          points={pts([-6, -6, 0], [W + 2, -6, 0], [W + 2, D + 2, 0], [-6, D + 2, 0])}
          fill="none"
          className="stroke-star/15"
          strokeDasharray="3 4"
        />
        {order.map((b, i) => {
          const h = b.sold ? RAISED : FLAT;
          // The block the callout points at stays put, so its dot stays on it.
          const lifts = b.sold && b !== firstSold;
          const { x, y } = b;
          return (
            <g
              key={i}
              className={`${b.sold ? "stroke-star/80" : "stroke-star/30"}${lifts ? " field-lift" : ""}`}
              // How far back to front the block sits, 0–1: the wave in
              // globals.css reaches it after that share of its sweep.
              style={lifts ? ({ "--d": ((x + y) / (W + D)).toFixed(3) } as CSSProperties) : undefined}
              fill="var(--color-night-900)"
              strokeWidth="0.8"
              strokeLinejoin="round"
            >
              <polygon points={pts([x + SIDE, y, 0], [x + SIDE, y + SIDE, 0], [x + SIDE, y + SIDE, h], [x + SIDE, y, h])} />
              <polygon points={pts([x, y + SIDE, 0], [x + SIDE, y + SIDE, 0], [x + SIDE, y + SIDE, h], [x, y + SIDE, h])} />
              <polygon points={pts([x, y, h], [x + SIDE, y, h], [x + SIDE, y + SIDE, h], [x, y + SIDE, h])} />
            </g>
          );
        })}

        <g className="max-sm:hidden">
          {firstSold && (
            <Callout
              at={[firstSold.x + SIDE / 2, firstSold.y + SIDE / 2, RAISED]}
              to={[left - 20, top - 30]}
              anchor="end"
              title={`LICENSED · ${sold.toLocaleString("en-US")}`}
              note="sold at least once"
            />
          )}
          {lastFlat && (
            <Callout
              at={[lastFlat.x + SIDE / 2, lastFlat.y + SIDE / 2, FLAT]}
              to={[right + 20, bottom + 10]}
              anchor="start"
              title={`ON FILE · ${total.toLocaleString("en-US")}`}
              note="waiting for a buyer"
              dim
            />
          )}
        </g>
      </svg>
      <dl aria-hidden="true" className="flex flex-wrap justify-between gap-x-4 gap-y-3 px-3 pb-2 font-mono text-[0.6875rem] tracking-[0.06em] whitespace-nowrap sm:hidden">
        <div>
          <dt className="tracking-[0.08em] text-star">LICENSED · {sold.toLocaleString("en-US")}</dt>
          <dd className="mt-1 text-star-faint">sold at least once</dd>
        </div>
        <div className="ml-auto text-right">
          <dt className="tracking-[0.08em] text-star-dim">ON FILE · {total.toLocaleString("en-US")}</dt>
          <dd className="mt-1 text-star-faint">waiting for a buyer</dd>
        </div>
      </dl>
    </>
  );
}

/** A leader from a block out to a label set clear of the field. */
function Callout({
  at,
  to,
  anchor,
  title,
  note,
  dim = false,
}: {
  at: V3;
  to: [number, number];
  anchor: "start" | "end";
  title: string;
  note: string;
  dim?: boolean;
}) {
  const [x, y] = iso(at);
  const [tx, ty] = to;
  const elbow = anchor === "end" ? tx + 14 : tx - 14;
  return (
    <g>
      <polyline
        points={`${x},${y} ${elbow},${ty} ${tx},${ty}`}
        fill="none"
        className="stroke-star/30"
        strokeWidth="1"
      />
      <circle cx={x} cy={y} r="2" className="fill-star" />
      <text
        x={anchor === "end" ? tx - 8 : tx + 8}
        y={ty - 4}
        textAnchor={anchor}
        className={`font-mono text-[13px] tracking-[0.08em] ${dim ? "fill-star-dim" : "fill-star"}`}
      >
        {title}
      </text>
      <text
        x={anchor === "end" ? tx - 8 : tx + 8}
        y={ty + 14}
        textAnchor={anchor}
        className="fill-star-faint font-mono text-[11px] tracking-[0.06em]"
      >
        {note}
      </text>
    </g>
  );
}
