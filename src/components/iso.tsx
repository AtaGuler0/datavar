import type { ReactNode } from "react";

/**
 * The isometric kit the system diagram and the step figures are drawn with.
 *
 * Everything is placed in world units and projected here rather than drawn in
 * screen space, so a box is always a box and moving one doesn't mean redrawing
 * three faces by hand. Faces are filled with the page colour and painted back
 * to front, which is all the hidden-line removal scenes this simple need.
 */

export type V3 = readonly [number, number, number];

export const COS = Math.cos(Math.PI / 6);
export const SIN = Math.sin(Math.PI / 6);

export function iso([x, y, z]: V3): [number, number] {
  return [(x - y) * COS, (x + y) * SIN - z];
}

/** Rounded to hundredths: server and browser disagree in the last digits of
 *  their trig, and an attribute that differs by 1e-15 fails hydration. */
export const pts = (...vs: V3[]) =>
  vs.map((v) => iso(v).map((n) => Math.round(n * 100) / 100).join(",")).join(" ");

export type Box = { x: number; y: number; z?: number; w: number; d: number; h: number };

/** Three visible faces of a box, back to front: right, left, top. */
export function BoxFaces({ x, y, z = 0, w, d, h, bright = false }: Box & { bright?: boolean }) {
  const top = z + h;
  return (
    <g
      className={bright ? "stroke-star/80" : "stroke-star/45"}
      fill="var(--color-night)"
      strokeWidth="1"
      strokeLinejoin="round"
    >
      <polygon points={pts([x + w, y, z], [x + w, y + d, z], [x + w, y + d, top], [x + w, y, top])} />
      <polygon points={pts([x, y + d, z], [x + w, y + d, z], [x + w, y + d, top], [x, y + d, top])} />
      <polygon points={pts([x, y, top], [x + w, y, top], [x + w, y + d, top], [x, y + d, top])} />
    </g>
  );
}

/** A flat rectangle lying on a plane at height z — screens, lines, chips. */
export function Flat({
  x,
  y,
  z,
  w,
  d,
  className = "stroke-star/45",
  fill = "none",
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  className?: string;
  fill?: string;
}) {
  return (
    <polygon
      points={pts([x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z])}
      className={className}
      fill={fill}
      strokeWidth="1"
    />
  );
}

/**
 * A wire on the ground through the given points, in screen space, with its
 * corners rounded. Returned as a path string so the packets can ride the same
 * line the wire draws.
 */
export function wire(points: V3[], radius = 16) {
  const p = points.map(iso);
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [px, py] = p[i - 1];
    const [cx, cy] = p[i];
    const [nx, ny] = p[i + 1];
    const into = Math.hypot(cx - px, cy - py);
    const out = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, into / 2, out / 2);
    d += ` L${cx - ((cx - px) / into) * r},${cy - ((cy - py) / into) * r}`;
    d += ` Q${cx},${cy} ${cx + ((nx - cx) / out) * r},${cy + ((ny - cy) / out) * r}`;
  }
  const [lx, ly] = p[p.length - 1];
  return `${d} L${lx},${ly}`;
}

/** A packet: a small cube standing on the wire, origin at its base. */
export function Cube() {
  return (
    <g
      className="stroke-star"
      fill="var(--color-night)"
      strokeWidth="1"
      strokeLinejoin="round"
    >
      <polygon points={pts([6, -6, 0], [6, 6, 0], [6, 6, 11], [6, -6, 11])} />
      <polygon points={pts([-6, 6, 0], [6, 6, 0], [6, 6, 11], [-6, 6, 11])} />
      <polygon points={pts([-6, -6, 11], [6, -6, 11], [6, 6, 11], [-6, 6, 11])} />
    </g>
  );
}

/**
 * Packets riding a wire. SMIL rather than CSS offset-path: it moves an SVG
 * element along an SVG path in that path's own coordinates in every browser,
 * which offset-path on SVG content still doesn't. Staggered with negative
 * begins so the wire is already busy on arrival instead of filling up.
 * Hidden under reduced motion by the `.packet` rule in globals.css.
 */
export function Packets({
  d,
  count,
  dur,
  children = <Cube />,
}: {
  d: string;
  count: number;
  dur: number;
  /** What rides the wire, drawn around its own origin. A cube by default. */
  children?: ReactNode;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const begin = `${(-dur * i) / count}s`;
        return (
          <g key={i} className="packet" opacity="0">
            <animateMotion dur={`${dur}s`} begin={begin} repeatCount="indefinite" path={d} calcMode="linear" />
            <animate
              attributeName="opacity"
              dur={`${dur}s`}
              begin={begin}
              repeatCount="indefinite"
              values="0;1;1;0"
              keyTimes="0;0.06;0.94;1"
            />
            {children}
          </g>
        );
      })}
    </>
  );
}

/** An upright mono label pinned to a point in the scene by a short leader. */
export function Label({
  at,
  children,
  dx = 0,
  dy = -36,
  anchor = "middle",
  dim = false,
}: {
  at: V3;
  children: string;
  dx?: number;
  dy?: number;
  anchor?: "start" | "middle" | "end";
  dim?: boolean;
}) {
  const [x, y] = iso(at);
  return (
    <g>
      <line x1={x} y1={y} x2={x + dx} y2={y + dy + 6} className="stroke-star/20" strokeWidth="1" />
      <circle cx={x} cy={y} r="1.6" className="fill-star/70" />
      <text
        x={x + dx}
        y={y + dy}
        textAnchor={anchor}
        className={`font-mono text-[12.5px] tracking-[0.08em] ${dim ? "fill-star-faint" : "fill-star"}`}
      >
        {children}
      </text>
    </g>
  );
}

/** World point on the ground under a screen position: the inverse of `iso`
 *  at z = 0. For laying a scene out by where things should land on screen. */
export function fromScreen(sx: number, sy: number): V3 {
  const a = sx / COS; // x − y
  const b = sy / SIN; // x + y
  return [(a + b) / 2, (b - a) / 2, 0];
}

/** A coin: an isometric disc standing on the wire, origin at its base. */
export function Coin() {
  const rim = (z: number) =>
    Array.from({ length: 16 }, (_, i) => {
      const t = (i / 16) * Math.PI * 2;
      return [Math.cos(t) * 9, Math.sin(t) * 9, z] as const;
    });
  return (
    <g className="stroke-star" fill="var(--color-night)" strokeWidth="1">
      <polygon points={pts(...rim(0))} />
      <polygon points={pts(...rim(5))} />
      <polygon points={pts(...rim(5).map(([x, y]) => [x * 0.5, y * 0.5, 5] as const))} className="stroke-star/50" fill="none" />
    </g>
  );
}
