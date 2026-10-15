"use client";

import { useEffect, useRef } from "react";

/**
 * The hero's backdrop, drawn in the same dust and starlight as the figures it
 * replaced: one suspension bridge across the bottom of the page, under a sky
 * of stars. A bridge is what the product is — the way from the people who
 * make data to the teams who need it — so it is the only thing drawn.
 *
 * Everything is points and hairlines. The cable, the deck and the towers are
 * the constellation; dust is sampled along them. On arrival the dust gathers
 * and the lines sweep in from the left; after that only the stars twinkle.
 * Reduced motion gets the settled frame. The loop stops off screen and in a
 * hidden tab.
 */

type Dust = {
  x: number;
  y: number;
  a: number;
  size: number;
  phase: number;
  sx: number;
  sy: number;
};

type Star = { x: number; y: number; a: number; size: number; phase: number; speed: number };

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------------------------------------------------- bridge */

type Bridge = {
  deck: number;
  towers: number[];
  top: number;
  cable: (x: number) => number;
  dust: Dust[];
  hangers: number[];
};

function buildBridge(w: number, h: number, rand: () => number): Bridge {
  const narrow = w < 640;
  const deck = Math.round(h * (narrow ? 0.9 : 0.88));
  const towers = narrow ? [w * 0.05, w * 0.95] : [w * 0.14, w * 0.86];
  const top = h * (narrow ? 0.62 : 0.46);
  const low = deck - 22;
  const anchor = deck - 8;
  const [t1, t2] = towers;
  const pad = 40;

  /** The main cable's height at x: a parabola between the towers, and a
   *  sagging run down to the anchorages beyond them. */
  const cable = (x: number) => {
    if (x >= t1 && x <= t2) {
      const u = (x - (t1 + t2) / 2) / ((t2 - t1) / 2);
      return low - (low - top) * u * u;
    }
    const u = x < t1 ? (t1 - x) / (t1 + pad) : (x - t2) / (w - t2 + pad);
    return top + (anchor - top) * u + (anchor - top) * 0.22 * u * (1 - u);
  };

  const dust: Dust[] = [];
  const push = (list: Dust[], x: number, y: number, a: number, size: number) =>
    list.push({ x, y, a, size, phase: rand() * Math.PI * 2, sx: rand() * w, sy: rand() * h });

  // Cable, deck edges, tower legs and beams: dust along each line.
  for (let x = -pad; x <= w + pad; x += 1.8) {
    push(dust, x + (rand() - 0.5), cable(x) + (rand() - 0.5) * 1.2, 0.3 + rand() * 0.35, 1);
    push(dust, x, deck + (rand() - 0.5) * 0.8, 0.35 + rand() * 0.3, 1);
    if (rand() < 0.7) push(dust, x, deck + 7 + (rand() - 0.5) * 0.8, 0.2 + rand() * 0.2, 0.9);
    if (rand() < 0.12) push(dust, x, deck + 1 + rand() * 6, 0.08 + rand() * 0.1, 0.8);
  }
  for (const t of towers) {
    for (let y = top - 6; y <= h; y += 1.8) {
      for (const side of [-9, 9]) push(dust, t + side + (rand() - 0.5), y, 0.35 + rand() * 0.35, 1);
      if (rand() < 0.15) push(dust, t + (rand() - 0.5) * 16, y, 0.06 + rand() * 0.1, 0.8);
    }
    for (const by of [top + 8, top + (deck - top) * 0.45, deck + 22]) {
      for (let x = t - 9; x <= t + 9; x += 1.6) push(dust, x, by + (rand() - 0.5), 0.4 + rand() * 0.3, 1);
    }
  }

  const hangers: number[] = [];
  for (let x = -pad + 13; x < w + pad; x += 26) {
    if (towers.some((t) => Math.abs(x - t) < 16)) continue;
    hangers.push(x);
  }

  return { deck, towers, top, cable, dust, hangers };
}

/* -------------------------------------------------------------- component */

const GATHER_MS = 1900;
const LINES_MS = 1100;
const STAR = [237, 237, 237] as const;

export function BridgeScene({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const [r, g, b] = STAR;
    const rgba = (a: number) => `rgba(${r},${g},${b},${a})`;

    let width = 0;
    let height = 0;
    let bridge: Bridge;
    let stars: Star[] = [];
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

      const rand = mulberry32(19);
      bridge = buildBridge(width, height, rand);
      const count = Math.round((width * bridge.deck) / 5600);
      stars = Array.from({ length: count }, () => {
        const bright = rand() < 0.06;
        return {
          x: rand() * width,
          y: rand() * bridge.deck * 0.92,
          a: bright ? 0.5 + rand() * 0.35 : 0.06 + rand() * 0.2,
          size: bright ? 1.3 : 0.6 + rand() * 0.5,
          phase: rand() * Math.PI * 2,
          speed: 0.4 + rand() * 1.1,
        };
      });
      if (!running) draw(performance.now());
    };

    const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

    const draw = (now: number) => {
      if (!start) start = now;
      const elapsed = reduced ? 1e9 : now - start;
      const time = elapsed / 1000;
      const gather = ease(elapsed / GATHER_MS);
      const lines = ease((elapsed - GATHER_MS * 0.6) / LINES_MS);
      const { deck, towers, top, cable, hangers } = bridge;

      ctx.clearRect(0, 0, width, height);

      for (const s of stars) {
        const tw = reduced ? 1 : 0.65 + 0.35 * Math.sin(time * s.speed + s.phase);
        ctx.fillStyle = rgba(s.a * tw * Math.min(1, gather * 2));
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }

      const plot = (list: Dust[], twinkle: number) => {
        for (const d of list) {
          const tw = reduced ? 1 : 1 - twinkle + twinkle * Math.sin(time * 1.3 + d.phase);
          ctx.fillStyle = rgba(d.a * tw * (0.25 + 0.75 * gather));
          ctx.fillRect(d.sx + (d.x - d.sx) * gather, d.sy + (d.y - d.sy) * gather, d.size, d.size);
        }
      };

      // The constellation: swept in from the left once the dust has landed.
      if (lines > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width * lines, height);
        ctx.clip();
        ctx.lineWidth = 0.8;

        ctx.strokeStyle = rgba(0.13);
        ctx.beginPath();
        for (const x of hangers) {
          ctx.moveTo(x, cable(x));
          ctx.lineTo(x, deck);
        }
        ctx.stroke();

        ctx.strokeStyle = rgba(0.45);
        ctx.beginPath();
        for (let x = -40; x <= width + 40; x += 4) {
          if (x === -40) ctx.moveTo(x, cable(x));
          else ctx.lineTo(x, cable(x));
        }
        ctx.moveTo(-40, deck);
        ctx.lineTo(width + 40, deck);
        for (const t of towers) {
          for (const side of [-9, 9]) {
            ctx.moveTo(t + side, top - 6);
            ctx.lineTo(t + side, height);
          }
        }
        ctx.stroke();

        // Stars where the hangers meet the cable, and on the tower tops.
        ctx.fillStyle = rgba(0.75);
        for (const x of hangers) {
          ctx.fillRect(x - 0.7, cable(x) - 0.7, 1.4, 1.4);
        }
        for (const t of towers) {
          const halo = ctx.createRadialGradient(t, top - 6, 0, t, top - 6, 7);
          halo.addColorStop(0, rgba(0.4));
          halo.addColorStop(1, rgba(0));
          ctx.fillStyle = halo;
          ctx.fillRect(t - 7, top - 13, 14, 14);
          ctx.fillStyle = rgba(0.95);
          ctx.beginPath();
          ctx.arc(t, top - 6, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      plot(bridge.dust, 0.22);
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
  }, []);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="A suspension bridge traced in points of light under a starry sky."
      className={className}
    />
  );
}
