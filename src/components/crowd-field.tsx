"use client";

import { useEffect, useRef } from "react";

/**
 * A crowd, rendered as a halftone of square dots on a rigid grid.
 *
 * The silhouette underneath is organic; the grid sampling it never moves.
 * That tension is the whole effect — same technique a newspaper uses, and the
 * reason it reads as considered rather than decorative. Nothing animates.
 *
 * Concept: a training set is a body of people before it is a body of data.
 * Each dot is a contributor; whole figures in the accent colour have consented
 * and are being paid. Colour is applied per person, never per dot — random
 * per-dot colouring just reads as speckle.
 */

const GRID = 8; // distance between dot centres
const DOT = 3; // square dot edge
const ALPHA_CUTOFF = 0.5; // silhouette coverage needed to place a dot
/** Share of *figures* — not dots — that are consented and drawn in accent. */
const CONSENT_SHARE = 0.18;

/** Deterministic PRNG — the crowd must not reshuffle on every resize. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One figure: head + shoulders, bottom left open so bodies merge into a mass. */
function drawPerson(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  h: number,
) {
  const headR = h * 0.115;
  const headCy = baseY - h + headR;
  const shoulderY = headCy + headR * 1.5;
  // Narrow enough that the gap to the next figure survives the halftone.
  const halfW = h * 0.17;

  ctx.beginPath();
  ctx.arc(x, headCy, headR, 0, Math.PI * 2);
  ctx.fill();

  // Torso: straight sides, rounded shoulders, running past baseY so the row
  // below overlaps it instead of showing a floating cut-off.
  ctx.beginPath();
  ctx.moveTo(x - halfW, baseY);
  ctx.lineTo(x - halfW, shoulderY + halfW * 0.55);
  ctx.quadraticCurveTo(x - halfW, shoulderY, x - halfW * 0.45, shoulderY);
  ctx.lineTo(x + halfW * 0.45, shoulderY);
  ctx.quadraticCurveTo(x + halfW, shoulderY, x + halfW, shoulderY + halfW * 0.55);
  ctx.lineTo(x + halfW, baseY);
  ctx.closePath();
  ctx.fill();
}

export function CrowdField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w === 0 || h === 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // 1. Two silhouettes, offscreen: everyone, and the consented subset.
      //    Sampling both lets a whole person carry the accent colour — random
      //    per-dot colouring just reads as speckle.
      const layer = () => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const cx = c.getContext("2d")!;
        cx.fillStyle = "#000";
        return cx;
      };
      const all = layer();
      const consented = layer();

      // Back row sits high and small; the front row overlaps it, which is what
      // makes the mass read as depth rather than as two stripes.
      const rows = [
        { height: 158, baseY: h * 0.66, step: 86 },
        { height: 224, baseY: h * 0.84, step: 120 },
        { height: 304, baseY: h * 1.14, step: 166 },
      ];

      const rand = mulberry32(20260716);
      for (const row of rows) {
        // Start off-canvas so the crowd never looks like it begins at the edge.
        for (let x = -row.step; x < w + row.step; x += row.step) {
          const jitterX = (rand() - 0.5) * row.step * 0.4;
          const jitterH = 1 + (rand() - 0.5) * 0.18;
          const isConsented = rand() < CONSENT_SHARE;

          drawPerson(all, x + jitterX, row.baseY, row.height * jitterH);
          if (isConsented) {
            drawPerson(consented, x + jitterX, row.baseY, row.height * jitterH);
          }
        }
      }

      // 2. Sample both silhouettes on a rigid grid and stamp squares.
      const allData = all.getImageData(0, 0, w, h).data;
      const consentData = consented.getImageData(0, 0, w, h).data;
      const half = DOT / 2;

      for (let gy = GRID / 2; gy < h; gy += GRID) {
        for (let gx = GRID / 2; gx < w; gx += GRID) {
          const px = ((Math.floor(gy) * w + Math.floor(gx)) << 2) + 3;
          if (allData[px] / 255 < ALPHA_CUTOFF) continue;

          const paid = consentData[px] / 255 >= ALPHA_CUTOFF;
          ctx.fillStyle = paid
            ? "rgba(61, 74, 107, 0.42)"
            : "rgba(22, 25, 43, 0.15)";
          ctx.fillRect(gx - half, gy - half, DOT, DOT);
        }
      }
    };

    render();

    const resizeObserver = new ResizeObserver(render);
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
