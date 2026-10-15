import { iso, pts, type V3 } from "../iso";

/**
 * A source category as a small isometric tile with its icon drawn on the top
 * face, in the line work of the landing page's figures. One per listing, so a
 * grid of them reads by kind before a word of it is read.
 */

const SIDE = 40;
const H = 7;

/** A point on the tile's top face, (u, v) from its centre. */
const on = (u: number, v: number): V3 => [SIDE / 2 + u, SIDE / 2 + v, H];

const circle = (cu: number, cv: number, r: number, n = 16) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return on(cu + Math.cos(t) * r, cv + Math.sin(t) * r);
  });

const ICONS: Record<string, V3[][]> = {
  browsing: [circle(-3, -3, 7.5), [on(2.5, 2.5), on(10, 10)]],
  purchases: [
    [on(-9, -4), on(9, -4), on(9, 11), on(-9, 11), on(-9, -4)],
    [on(-4, -4), on(-4, -10), on(4, -10), on(4, -4)],
  ],
  health: [[on(-13, 0), on(-5, 0), on(-2, -9), on(2, 9), on(5, 0), on(13, 0)]],
  location: [circle(0, -3, 6), [on(-4.5, 1), on(0, 11), on(4.5, 1)]],
  media: [[on(-7, -9), on(10, 0), on(-7, 9), on(-7, -9)]],
  voice: [-10, -5, 0, 5, 10].map((u, i) => {
    const h = [4, 9, 12, 7, 3][i];
    return [on(u, -h), on(u, h)];
  }),
  messaging: [
    [on(-11, -9), on(11, -9), on(11, 5), on(-2, 5), on(-8, 11), on(-7, 5), on(-11, 5), on(-11, -9)],
  ],
  dashcam: [
    [on(-12, -8), on(8, -8), on(8, 8), on(-12, 8), on(-12, -8)],
    circle(-2, 0, 4.5),
    [on(8, -3), on(13, -7), on(13, 7), on(8, 3)],
  ],
  other: [circle(-8, 0, 1.6, 8), circle(0, 0, 1.6, 8), circle(8, 0, 1.6, 8)],
};

export function SourceTile({ source, className = "" }: { source: string; className?: string }) {
  const lines = ICONS[source] ?? ICONS.other;
  const [left] = iso([0, SIDE, 0]);
  const [right] = iso([SIDE, 0, 0]);
  const [, top] = iso([0, 0, H]);
  const [, bottom] = iso([SIDE, SIDE, 0]);
  return (
    <svg
      viewBox={`${left - 2} ${top - 2} ${right - left + 4} ${bottom - top + 4}`}
      className={className}
      aria-hidden="true"
    >
      <g className="stroke-star/60" fill="var(--color-night)" strokeWidth="1" strokeLinejoin="round">
        <polygon points={pts([SIDE, 0, 0], [SIDE, SIDE, 0], [SIDE, SIDE, H], [SIDE, 0, H])} />
        <polygon points={pts([0, SIDE, 0], [SIDE, SIDE, 0], [SIDE, SIDE, H], [0, SIDE, H])} />
        <polygon points={pts([0, 0, H], [SIDE, 0, H], [SIDE, SIDE, H], [0, SIDE, H])} />
      </g>
      {lines.map((line, i) => (
        <polyline
          key={i}
          points={pts(...line)}
          fill="none"
          className="stroke-star"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
