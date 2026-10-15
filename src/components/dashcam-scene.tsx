"use client";

import { useEffect, useRef } from "react";

/**
 * The closing figure: the view from a dashcam, the most contributed source on
 * the protocol, in the same dust and hairlines as the rest of the page. A road
 * runs to a low skyline on the horizon, lane dashes and street lights stream
 * past, and the bonnet sits along the bottom. Over it, the camera's own
 * readout — recording, the time, the speed — and in the corner the part that
 * is Datavar's: the footage is hashed on the device and shared with no one.
 *
 * Everything is drawn in a perspective of its own: a camera 1.4 m above the
 * road, world points projected onto the canvas, so the dashes and lights
 * speed up and spread out as they come near the way they do through a
 * windscreen. Reduced motion gets one still frame. The loop stops off screen
 * and in a hidden tab.
 */

const STAR = [237, 237, 237] as const;
const REC = "229,99,106"; // --color-danger: the one colour, for the one light that means "recording".
const CAM_HEIGHT = 1.4;
/** Metres per second: a steady 50 km/h. */
const SPEED = 13.9;
const FAR = 160;
const DASH = 3;
const DASH_GAP = 9;
const LIGHT_GAP = 32;
const POST_GAP = 8;

type Dust = { x: number; y: number; a: number; size: number; phase: number };

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function DashcamScene({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mono = getComputedStyle(canvas).fontFamily;
    const [r, g, b] = STAR;
    const rgba = (a: number) => `rgba(${r},${g},${b},${a})`;

    let width = 0;
    let height = 0;
    let horizon = 0;
    let focal = 0;
    let cx = 0;
    let fixed: Dust[] = [];
    let stars: Dust[] = [];
    let start = 0;
    let frame = 0;
    let running = false;
    let visible = true;

    /** World (x across, z ahead, y up from the road) → canvas. */
    const project = (x: number, z: number, y = 0): [number, number] => [
      cx + (focal * x) / z,
      horizon + (focal * (CAM_HEIGHT - y)) / z,
    ];
    const nearZ = () => (focal * CAM_HEIGHT) / (height - horizon);

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      horizon = height * 0.44;
      focal = width * 0.62;
      // Sitting in the right-hand lane, a little right of the road's middle.
      cx = width * 0.54;

      const rand = mulberry32(31);
      const push = (list: Dust[], x: number, y: number, a: number, size = 1) =>
        list.push({ x, y, a, size, phase: rand() * Math.PI * 2 });

      fixed = [];
      // Road edges and the far kerb: solid, so they never move on screen.
      for (let y = horizon + 1.5; y < height; y += 1.6) {
        const z = (focal * CAM_HEIGHT) / (y - horizon);
        const fade = Math.min(1, 14 / z);
        for (const x of [1.75, -5.25]) {
          const [sx] = project(x, z);
          push(fixed, sx + (rand() - 0.5), y, (0.25 + rand() * 0.3) * (0.35 + 0.65 * fade));
        }
        // The road surface: sparse grain, thinning into the distance.
        if (rand() < 0.5) {
          const x = -5.25 + rand() * 7;
          const [sx] = project(x, z);
          push(fixed, sx, y, 0.04 + rand() * 0.06 * fade, 0.8);
        }
      }
      // A low skyline along the horizon.
      for (let x = 0; x < width; ) {
        const bw = 6 + rand() * 22;
        const bh = 3 + rand() * rand() * height * 0.11;
        for (let y = horizon - bh; y < horizon; y += 2) {
          push(fixed, x, y, 0.08 + rand() * 0.08, 0.8);
          push(fixed, x + bw, y, 0.08 + rand() * 0.08, 0.8);
        }
        for (let xx = x; xx <= x + bw; xx += 2) push(fixed, xx, horizon - bh, 0.1 + rand() * 0.1, 0.8);
        if (bh > 14) {
          for (let k = 0; k < bh / 8; k++) push(fixed, x + 2 + rand() * (bw - 4), horizon - bh + 3 + rand() * (bh - 5), 0.25 + rand() * 0.3, 1);
        }
        x += bw + rand() * 8;
      }
      // The bonnet: a shallow curve across the bottom of the frame.
      const bonnet = (x: number) => height - 6 - 14 * (1 - ((x - width / 2) / (width * 0.62)) ** 2);
      for (let x = 0; x <= width; x += 1.6) {
        push(fixed, x, bonnet(x) + (rand() - 0.5), 0.45 + rand() * 0.35, 1);
        for (let y = bonnet(x) + 3; y < height; y += 3) {
          if (rand() < 0.18) push(fixed, x, y, 0.05 + rand() * 0.08, 0.8);
        }
      }

      stars = [];
      for (let k = 0; k < (width * horizon) / 2600; k++) {
        const bright = rand() < 0.06;
        push(stars, rand() * width, rand() * horizon * 0.92, bright ? 0.5 + rand() * 0.3 : 0.05 + rand() * 0.18, bright ? 1.2 : 0.7);
      }

      if (!running) draw(performance.now());
    };

    const label = (text: string, x: number, y: number, align: CanvasTextAlign, alpha: number, size = 11) => {
      ctx.font = `${size}px ${mono}`;
      ctx.textAlign = align;
      ctx.fillStyle = rgba(alpha);
      ctx.fillText(text, x, y);
    };

    const draw = (now: number) => {
      if (!start) start = now;
      const time = reduced ? 0 : (now - start) / 1000;
      const travelled = time * SPEED;
      const near = nearZ();

      ctx.clearRect(0, 0, width, height);

      for (const s of stars) {
        const tw = reduced ? 1 : 0.65 + 0.35 * Math.sin(time * 1.1 + s.phase);
        ctx.fillStyle = rgba(s.a * tw);
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      for (const d of fixed) {
        ctx.fillStyle = rgba(d.a);
        ctx.fillRect(d.x, d.y, d.size, d.size);
      }

      // Lane dashes between our lane and the next, streaming towards us.
      const period = DASH + DASH_GAP;
      const offset = travelled % period;
      for (let z0 = near - offset; z0 < FAR; z0 += period) {
        const a = Math.max(z0, near * 0.98);
        const b2 = z0 + DASH;
        if (b2 <= a) continue;
        const fade = Math.min(1, 30 / a);
        for (let t = 0; t <= 1; t += 0.04) {
          const z = a + (b2 - a) * t;
          const [sx, sy] = project(-1.75, z);
          ctx.fillStyle = rgba(0.75 * fade);
          const w = Math.max(1, (focal * 0.12) / z);
          ctx.fillRect(sx - w / 2, sy, w, 1.2);
        }
      }

      // Kerb posts on the right, close together: the quickest thing in frame.
      ctx.lineWidth = 1;
      const postOffset = travelled % POST_GAP;
      for (let z = near + POST_GAP - postOffset; z < FAR * 0.6; z += POST_GAP) {
        const [x1, y1] = project(2.6, z);
        const [, y2] = project(2.6, z, 0.8);
        // Faded in from far off and out again close up, so the nearest post
        // never becomes a bar across the frame.
        ctx.strokeStyle = rgba(0.5 * Math.min(1, 20 / z) * Math.min(1, (z - near) / 6));
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1, y2);
        ctx.stroke();
      }

      // Street lights: a pole, an arm out over the road, a lamp.
      const lightOffset = travelled % LIGHT_GAP;
      for (let z = near + 6 - lightOffset + LIGHT_GAP; z > near * 0.9 && z < FAR; z += LIGHT_GAP) {
        // Out of frame well before it reaches the camera, as on a real one.
        if (z < 14) continue;
        const fade = Math.min(1, 40 / z) * Math.min(1, (z - 14) / 10);
        const [px, py] = project(4.2, z);
        const [, top] = project(4.2, z, 7);
        const [ax, ay] = project(2.4, z, 7.2);
        ctx.strokeStyle = rgba(0.45 * fade);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, top);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        const glowR = Math.max(4, (focal * 1.6) / z);
        const glow = ctx.createRadialGradient(ax, ay, 0, ax, ay, glowR);
        glow.addColorStop(0, rgba(0.35 * fade));
        glow.addColorStop(1, rgba(0));
        ctx.fillStyle = glow;
        ctx.fillRect(ax - glowR, ay - glowR, glowR * 2, glowR * 2);
        ctx.fillStyle = rgba(0.95 * fade);
        ctx.fillRect(ax - 1, ay - 1, 2, 2);
      }

      /* ---- the camera's readout ---- */
      const inset = 16;
      const arm = 18;
      ctx.strokeStyle = rgba(0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [x, y, dx, dy] of [
        [inset, inset, 1, 1],
        [width - inset, inset, -1, 1],
        [inset, height - inset, 1, -1],
        [width - inset, height - inset, -1, -1],
      ] as const) {
        ctx.moveTo(x + dx * arm, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + dy * arm);
      }
      ctx.stroke();

      const on = reduced || Math.floor(time * 1.25) % 2 === 0;
      ctx.fillStyle = `rgba(${REC},${on ? 1 : 0.25})`;
      ctx.beginPath();
      ctx.arc(inset + 16, inset + 20, 3.5, 0, Math.PI * 2);
      ctx.fill();
      label("REC", inset + 26, inset + 24, "left", 0.9);
      // On a phone-width frame the readout keeps only what it must.
      const narrow = width < 460;
      if (!narrow) label("CAM 01 · FRONT", inset + 56, inset + 24, "left", 0.45);

      const d = new Date(Date.now());
      const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const stamp = narrow ? clock : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}  ${clock}`;
      label(stamp, width - inset - 10, inset + 24, "right", 0.7);

      const kmh = Math.round(SPEED * 3.6 + (reduced ? 0 : Math.sin(time * 0.7) * 1.2));
      // Set above the bonnet, clear of it.
      const base = height - inset - 30;
      label(`${kmh} KM/H`, inset + 10, base, "left", 0.9, 12);
      label(`FRAME ${pad(Math.floor(time * 30) + 4180, 6)}`, inset + 10, base - 18, "left", 0.4);

      label("HASHED ON DEVICE", width - inset - 10, base - 18, "right", 0.9);
      label(narrow ? "NOT SHARED" : "NOT SHARED · NO CONSENT YET", width - inset - 10, base, "right", 0.45);
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
      aria-label="Dashcam footage traced in points of light: a road at night running to a low skyline, street lights passing, the bonnet along the bottom. The readout says it is recording, hashed on the device, and not shared."
      className={`font-mono ${className}`}
    />
  );
}
