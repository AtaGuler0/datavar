"use client";

import { useEffect, useRef } from "react";

/**
 * People drawn in the data they produce.
 *
 * Each figure is a skeleton — the constellation, joints as stars and bones as
 * hairlines — wrapped in a body that exists only as points. The points are
 * sampled from a signed distance field over the figure's limbs, kept dense at
 * the edge and sparse inside, so the body reads as an outline drawn in dust
 * rather than a filled silhouette. The device in each figure's hands is the
 * brightest thing in it, and a few motes leave it and rise: the data, on its
 * way out.
 *
 * On arrival the points start scattered and gather into the figures, then the
 * constellation is drawn over them. After that the only motion is a slow
 * twinkle and the motes. Reduced motion gets the settled frame and nothing
 * else. The loop stops whenever the canvas is off screen or the tab is hidden.
 */

type Pt = readonly [number, number];

type Figure = {
  /** Local drawing box. Feet stand on y = height. */
  width: number;
  height: number;
  joints: Record<string, Pt>;
  /** Limbs as tapered capsules: from joint, to joint, radius at each end. */
  limbs: readonly (readonly [string, string, number, number])[];
  torso: readonly Pt[];
  head: { c: Pt; rx: number; ry: number; tilt: number };
  /** The device, as rotated rectangles — one for a phone, two for a
   *  laptop's base and lid — plus an optional lens. The first one's centre is
   *  where its light comes from. */
  device: { c: Pt; w: number; h: number; angle: number }[];
  lens?: Pt;
  /** Where motes leave from — the screen or the lens. */
  emitter: Pt;
  /** Bones of the constellation, drawn over the dust. */
  bones: readonly (readonly [string, string])[];
};

/** Bones shared by every standing figure. */
const SKELETON = [
  ["crown", "neck"],
  ["neck", "shoulderL"],
  ["neck", "shoulderR"],
  ["shoulderL", "elbowL"],
  ["elbowL", "wristL"],
  ["shoulderR", "elbowR"],
  ["elbowR", "wristR"],
  ["neck", "pelvis"],
  ["pelvis", "hipL"],
  ["pelvis", "hipR"],
  ["hipL", "kneeL"],
  ["kneeL", "ankleL"],
  ["ankleL", "toeL"],
  ["hipR", "kneeR"],
  ["kneeR", "ankleR"],
  ["ankleR", "toeR"],
] as const;

const LIMBS = [
  ["neck", "crownBase", 7, 7],
  ["shoulderL", "elbowL", 9.5, 7.5],
  ["elbowL", "wristL", 7, 5],
  ["shoulderR", "elbowR", 9.5, 7.5],
  ["elbowR", "wristR", 7, 5],
  ["hipL", "kneeL", 14, 9.5],
  ["kneeL", "ankleL", 9, 5.5],
  ["ankleL", "toeL", 5.5, 4],
  ["hipR", "kneeR", 14, 9.5],
  ["kneeR", "ankleR", 9, 5.5],
  ["ankleR", "toeR", 5.5, 4],
] as const;

/** Walking, eyes on a phone held at chest height. Faces right. */
const PHONE: Figure = {
  width: 240,
  height: 440,
  joints: {
    crown: [128, 28],
    crownBase: [126, 62],
    neck: [122, 80],
    shoulderL: [98, 96],
    shoulderR: [146, 94],
    elbowL: [86, 168],
    wristL: [83, 236],
    elbowR: [154, 164],
    wristR: [176, 130],
    pelvis: [121, 226],
    hipL: [106, 230],
    hipR: [138, 228],
    kneeL: [100, 326],
    ankleL: [84, 414],
    toeL: [100, 432],
    kneeR: [146, 322],
    ankleR: [160, 414],
    toeR: [180, 432],
  },
  limbs: LIMBS,
  torso: [
    [97, 98],
    [148, 96],
    [139, 150],
    [134, 192],
    [140, 232],
    [102, 234],
    [108, 192],
    [104, 150],
  ],
  head: { c: [129, 48], rx: 16, ry: 20, tilt: 0.28 },
  device: [{ c: [181, 118], w: 13, h: 23, angle: -0.38 }],
  emitter: [184, 106],
  bones: SKELETON,
};

/** Camera to the eye, weight on the back foot. Faces right. */
const CAMERA: Figure = {
  width: 240,
  height: 440,
  joints: {
    crown: [122, 26],
    crownBase: [120, 62],
    neck: [118, 80],
    shoulderL: [94, 98],
    shoulderR: [142, 96],
    elbowL: [117, 128],
    wristL: [140, 70],
    elbowR: [177, 113],
    wristR: [166, 64],
    pelvis: [120, 228],
    hipL: [104, 232],
    hipR: [137, 230],
    kneeL: [94, 326],
    ankleL: [78, 416],
    toeL: [96, 432],
    kneeR: [150, 322],
    ankleR: [164, 414],
    toeR: [184, 432],
  },
  limbs: LIMBS,
  torso: [
    [88, 100],
    [148, 98],
    [140, 150],
    [136, 192],
    [141, 234],
    [99, 236],
    [104, 192],
    [98, 150],
  ],
  head: { c: [124, 46], rx: 16, ry: 20, tilt: 0.05 },
  device: [{ c: [153, 56], w: 30, h: 19, angle: 0.02 }],
  lens: [174, 57],
  emitter: [184, 54],
  bones: SKELETON,
};

/** Sitting on the floor, knees up, laptop on the thighs. Faces right. */
const DESK: Figure = {
  width: 300,
  height: 296,
  joints: {
    crown: [97, 50],
    crownBase: [90, 92],
    neck: [86, 104],
    shoulderL: [80, 120],
    shoulderR: [90, 118],
    elbowL: [94, 190],
    wristL: [130, 226],
    elbowR: [104, 186],
    wristR: [142, 220],
    pelvis: [84, 264],
    hipL: [78, 266],
    hipR: [92, 262],
    kneeL: [160, 248],
    ankleL: [232, 288],
    toeL: [246, 274],
    kneeR: [168, 238],
    ankleR: [240, 284],
    toeR: [254, 270],
  },
  limbs: LIMBS,
  torso: [
    [70, 120],
    [100, 116],
    [106, 170],
    [102, 228],
    [102, 262],
    [66, 268],
    [63, 220],
    [67, 170],
  ],
  head: { c: [93, 72], rx: 15, ry: 19, tilt: 0.35 },
  device: [
    // Lid first: its centre is where the screen's light comes from.
    { c: [174, 198], w: 6, h: 58, angle: 0.25 },
    { c: [134, 236], w: 68, h: 6, angle: -0.28 },
  ],
  emitter: [181, 172],
  bones: SKELETON,
};

/* ---------------------------------------------------------------- sampling */

/** Deterministic PRNG — the dust must not reshuffle on every resize. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sdCapsule(p: Pt, a: Pt, b: Pt, ra: number, rb: number) {
  const pax = p[0] - a[0];
  const pay = p[1] - a[1];
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const h = Math.max(
    0,
    Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)),
  );
  return Math.hypot(pax - bax * h, pay - bay * h) - (ra + (rb - ra) * h);
}

function sdPolygon(p: Pt, poly: readonly Pt[]) {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    d = Math.min(d, sdCapsule(p, a, b, 0, 0));
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside ? -d : d;
}

function sdEllipse(p: Pt, c: Pt, rx: number, ry: number, tilt: number) {
  const cos = Math.cos(-tilt);
  const sin = Math.sin(-tilt);
  const x = (p[0] - c[0]) * cos - (p[1] - c[1]) * sin;
  const y = (p[0] - c[0]) * sin + (p[1] - c[1]) * cos;
  // Not an exact distance, but monotonic and close enough near the rim,
  // which is the only place the value is used for anything but a sign.
  return (Math.hypot(x / rx, y / ry) - 1) * Math.min(rx, ry);
}

function sdBox(p: Pt, c: Pt, w: number, h: number, angle: number) {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const x = Math.abs((p[0] - c[0]) * cos - (p[1] - c[1]) * sin) - w / 2;
  const y = Math.abs((p[0] - c[0]) * sin + (p[1] - c[1]) * cos) - h / 2;
  return (
    Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0)
  );
}

/** Polynomial smooth minimum: joints blend instead of creasing. */
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/** One sampled point, in the figure's local space. */
type Dust = {
  x: number;
  y: number;
  /** Resting brightness, 0–1. */
  a: number;
  size: number;
  phase: number;
  /** Where it starts before gathering. */
  sx: number;
  sy: number;
};

const STEP = 2.2;
const RIM = 1.6;

function sampleFigure(fig: Figure, seed: number) {
  const rand = mulberry32(seed);
  const { joints: j } = fig;

  const body = (p: Pt) => {
    let d = sdPolygon(p, fig.torso);
    d = smin(d, sdEllipse(p, fig.head.c, fig.head.rx, fig.head.ry, fig.head.tilt), 6);
    for (const [a, b, ra, rb] of fig.limbs) {
      d = smin(d, sdCapsule(p, j[a], j[b], ra, rb), 7);
    }
    // Hands: small knots at the wrists.
    d = smin(d, Math.hypot(p[0] - j.wristL[0], p[1] - j.wristL[1]) - 5.5, 4);
    d = smin(d, Math.hypot(p[0] - j.wristR[0], p[1] - j.wristR[1]) - 5.5, 4);
    return d;
  };

  const deviceSd = (p: Pt) => {
    let d = Infinity;
    for (const part of fig.device) {
      d = Math.min(d, sdBox(p, part.c, part.w, part.h, part.angle));
    }
    if (fig.lens) {
      d = Math.min(d, Math.hypot(p[0] - fig.lens[0], p[1] - fig.lens[1]) - 7);
    }
    return d;
  };

  const dust: Dust[] = [];
  const glints: Dust[] = [];

  for (let y = 0; y < fig.height; y += STEP) {
    for (let x = 0; x < fig.width; x += STEP) {
      const p: Pt = [
        x + (rand() - 0.5) * STEP * 0.9,
        y + (rand() - 0.5) * STEP * 0.9,
      ];
      const dd = deviceSd(p);
      const db = body(p);
      const scatter = () => {
        const ang = rand() * Math.PI * 2;
        const r = 40 + rand() * 160;
        return [p[0] + Math.cos(ang) * r, p[1] + Math.sin(ang) * r * 0.7];
      };

      // The device sits in front of the body: its edge and screen win.
      if (dd < 0.6) {
        const edge = dd > -1.4;
        if (!edge && rand() > 0.55) continue;
        const [sx, sy] = scatter();
        glints.push({
          x: p[0],
          y: p[1],
          a: edge ? 1 : 0.55 + rand() * 0.3,
          size: edge ? 1.15 : 0.9,
          phase: rand() * Math.PI * 2,
          sx,
          sy,
        });
        continue;
      }

      if (db > 0.4) continue;
      const depth = -db;
      // Dense, bright rim; sparse, dim interior. That ratio is what makes a
      // volume read as a drawing.
      const onRim = depth < RIM;
      if (!onRim && rand() > 0.1 + 0.14 * Math.exp(-depth / 5)) continue;

      const [sx, sy] = scatter();
      dust.push({
        x: p[0],
        y: p[1],
        a: onRim ? 0.6 + rand() * 0.38 : 0.08 + rand() * 0.2,
        size: onRim ? 0.9 + rand() * 0.3 : 0.7 + rand() * 0.35,
        phase: rand() * Math.PI * 2,
        sx,
        sy,
      });
    }
  }

  return { dust, glints };
}

/* ------------------------------------------------------------------ layout */

type Placement = {
  fig: Figure;
  /** Screen x of the figure's horizontal centre, and of its feet. */
  cx: number;
  base: number;
  scale: number;
  mirror: boolean;
  seed: number;
};

type Star = { x: number; y: number; a: number; size: number; phase: number; speed: number };
type Mote = { t: number; life: number; dx: number; drift: number; size: number };

/** Which figures a canvas holds: the pair that flanks the hero copy, or the
 *  one at the desk. */
export type Scene = "hero" | "desk";

function layout(scene: Scene, width: number, height: number): Placement[] {
  if (scene === "desk") {
    const scale = Math.min(1.5, (height * 0.82) / DESK.height, (width * 0.9) / DESK.width);
    return [{ fig: DESK, cx: width / 2, base: height * 0.92, scale, mirror: false, seed: 47 }];
  }
  if (width < 640) {
    // Phones: the copy needs the whole width, so the figures stand small in
    // the bottom corners and are mostly cut off by the edge.
    const scale = Math.min(0.5, (height * 0.24) / PHONE.height);
    return [
      { fig: PHONE, cx: width * 0.02, base: height - 6, scale, mirror: false, seed: 11 },
      { fig: CAMERA, cx: width * 0.98, base: height - 6, scale, mirror: true, seed: 29 },
    ];
  }
  const scale = Math.min(1.08, (height * 0.5) / PHONE.height, width / 1200);
  const inset = width < 1024 ? 0.08 : 0.135;
  return [
    { fig: PHONE, cx: width * inset, base: height * 0.95, scale, mirror: false, seed: 11 },
    // The photographer faces inward too: drawn facing right, flipped.
    { fig: CAMERA, cx: width * (1 - inset), base: height * 0.95, scale, mirror: true, seed: 29 },
  ];
}

/* --------------------------------------------------------------- component */

const GATHER_MS = 1900;
const LINES_MS = 900;
const STAR = [237, 237, 237] as const;

const LABELS: Record<Scene, string> = {
  hero: "Two people traced in points of light: one walking with a phone, one taking a photo, each a constellation of the data they produce.",
  desk: "A person sitting cross-legged with a laptop, traced in points of light.",
};

export function Constellation({
  scene = "hero",
  className = "",
}: {
  scene?: Scene;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sampled = new Map<Figure, ReturnType<typeof sampleFigure>>();
    const sample = (fig: Figure, seed: number) => {
      if (!sampled.has(fig)) sampled.set(fig, sampleFigure(fig, seed));
      return sampled.get(fig)!;
    };

    let width = 0;
    let height = 0;
    let places: Placement[] = [];
    let stars: Star[] = [];
    const motes: Mote[][] = [];
    let start = 0;
    let frame = 0;
    let running = false;
    let visible = true;

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      places = layout(scene, width, height);

      const rand = mulberry32(7);
      const count = Math.round((width * height) / (scene === "hero" ? 5200 : 9000));
      stars = Array.from({ length: count }, () => {
        const bright = rand() < 0.06;
        return {
          x: rand() * width,
          y: rand() * height,
          a: bright ? 0.5 + rand() * 0.35 : 0.06 + rand() * 0.2,
          size: bright ? 1.3 : 0.6 + rand() * 0.5,
          phase: rand() * Math.PI * 2,
          speed: 0.4 + rand() * 1.1,
        };
      });

      places.forEach((_, i) => {
        motes[i] ??= Array.from({ length: 14 }, (_, k) => ({
          t: -k * 0.55,
          life: 5 + (k % 4),
          dx: ((k * 37) % 23) - 11,
          drift: ((k * 53) % 17) / 17 - 0.5,
          size: 0.8 + (k % 3) * 0.3,
        }));
      });

      if (!running) draw(performance.now());
    };

    /** Local figure space → screen. */
    const toScreen = (p: Placement, x: number, y: number): Pt => {
      const lx = (p.mirror ? p.fig.width - x : x) - p.fig.width / 2;
      return [p.cx + lx * p.scale, p.base - (p.fig.height - y) * p.scale];
    };

    const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

    const draw = (now: number) => {
      if (!start) start = now;
      const elapsed = reduced ? 1e9 : now - start;
      const time = elapsed / 1000;
      const gather = ease(elapsed / GATHER_MS);
      const lines = ease((elapsed - GATHER_MS * 0.7) / LINES_MS);

      ctx.clearRect(0, 0, width, height);
      const [r, g, b] = STAR;

      // Sky.
      for (const s of stars) {
        const tw = reduced ? 1 : 0.65 + 0.35 * Math.sin(time * s.speed + s.phase);
        ctx.fillStyle = `rgba(${r},${g},${b},${s.a * tw * Math.min(1, gather * 2)})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }

      places.forEach((place, i) => {
        const { dust, glints } = sample(place.fig, place.seed);
        const px = Math.max(0.7, place.scale);

        const plot = (d: Dust, alpha: number, size: number) => {
          const x = d.sx + (d.x - d.sx) * gather;
          const y = d.sy + (d.y - d.sy) * gather;
          const [sx, sy] = toScreen(place, x, y);
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.fillRect(sx, sy, size * px, size * px);
        };

        for (const d of dust) {
          const tw = reduced ? 1 : 0.78 + 0.22 * Math.sin(time * 1.3 + d.phase);
          plot(d, d.a * tw * (0.25 + 0.75 * gather), d.size);
        }

        // The device's light, then its edge.
        const [ex, ey] = toScreen(place, ...place.fig.device[0].c);
        const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, 46 * place.scale);
        glow.addColorStop(0, `rgba(${r},${g},${b},${0.13 * gather})`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(ex - 50 * place.scale, ey - 50 * place.scale, 100 * place.scale, 100 * place.scale);
        for (const d of glints) plot(d, d.a * (0.3 + 0.7 * gather), d.size);

        // The constellation: hairline bones, stars at the joints.
        if (lines > 0) {
          const { joints } = place.fig;
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = `rgba(${r},${g},${b},${0.42 * lines})`;
          ctx.beginPath();
          for (const [a, b2] of place.fig.bones) {
            const [ax, ay] = toScreen(place, ...joints[a]);
            const [bx, by] = toScreen(place, ...joints[b2]);
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + (bx - ax) * lines, ay + (by - ay) * lines);
          }
          ctx.stroke();

          for (const name of new Set(place.fig.bones.flat())) {
            const [jx, jy] = toScreen(place, ...joints[name]);
            const halo = ctx.createRadialGradient(jx, jy, 0, jx, jy, 5);
            halo.addColorStop(0, `rgba(${r},${g},${b},${0.35 * lines})`);
            halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx.fillStyle = halo;
            ctx.fillRect(jx - 5, jy - 5, 10, 10);
            ctx.fillStyle = `rgba(${r},${g},${b},${0.95 * lines})`;
            ctx.beginPath();
            ctx.arc(jx, jy, 1.35, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Motes: leave the device, rise, fade. Not in reduced motion — a
        // still mote is just a speck of dirt on the screen.
        if (!reduced && gather >= 1) {
          for (const m of motes[i]) {
            const t = ((time - GATHER_MS / 1000 + m.t) % m.life) / m.life;
            if (time - GATHER_MS / 1000 + m.t < 0) continue;
            const [mx, my] = toScreen(
              place,
              place.fig.emitter[0] + m.dx * t + Math.sin(t * 6 + m.drift * 9) * 6 * m.drift,
              place.fig.emitter[1] - t * 150,
            );
            const alpha = Math.sin(t * Math.PI) * 0.75;
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.fillRect(mx, my, m.size, m.size);
          }
        }
      });
    };

    const loop = (now: number) => {
      draw(now);
      frame = requestAnimationFrame(loop);
    };
    const play = () => {
      if (running || reduced || !visible || document.hidden) return;
      running = true;
      frame = requestAnimationFrame(loop);
    };
    const pause = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const sizer = new ResizeObserver(resize);
    sizer.observe(canvas);

    const watcher = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) play();
      else pause();
    });
    watcher.observe(canvas);

    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener("visibilitychange", onVisibility);

    resize();
    play();

    return () => {
      pause();
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [scene]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={LABELS[scene]}
      className={className}
    />
  );
}
