"use client";

import { useEffect, useRef } from "react";

/**
 * A slice of the world, rendered as a halftone of square dots on a rigid grid.
 *
 * The silhouette underneath is organic; the grid sampling it never moves.
 * That tension is the whole effect — same technique a newspaper uses, and the
 * reason it reads as considered rather than decorative. Nothing animates.
 *
 * Concept: a training set is the world before it is data. People, parks, dogs,
 * shops — everyday life is what models learn from. Whole figures in the accent
 * colour have consented and are being paid. Colour is applied per figure,
 * never per dot — random per-dot colouring just reads as speckle.
 *
 * The mass follows a V envelope: low in the centre, rising to the edges, so
 * the hero copy and buttons sit in clear air.
 */

const GRID = 8; // distance between dot centres
const DOT = 3; // square dot edge
const ALPHA_CUTOFF = 0.5; // silhouette coverage needed to place a dot
/** Share of *figures* — not dots — that are consented and drawn in accent. */
const CONSENT_SHARE = 0.18;

/** Deterministic PRNG — the scene must not reshuffle on every resize. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

/** One figure: head + shoulders, bottom left open so bodies merge into a mass. */
function drawPerson(ctx: Ctx, x: number, baseY: number, h: number) {
  const headR = h * 0.115;
  const headCy = baseY - h + headR;
  const shoulderY = headCy + headR * 1.5;
  const halfW = h * 0.17;

  ctx.beginPath();
  ctx.arc(x, headCy, headR, 0, Math.PI * 2);
  ctx.fill();

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

/** A park tree: trunk plus a lumpy three-lobe canopy. */
function drawTree(ctx: Ctx, x: number, baseY: number, h: number) {
  ctx.fillRect(x - h * 0.035, baseY - h * 0.5, h * 0.07, h * 0.5);

  ctx.beginPath();
  ctx.arc(x, baseY - h * 0.68, h * 0.3, 0, Math.PI * 2);
  ctx.arc(x - h * 0.2, baseY - h * 0.52, h * 0.21, 0, Math.PI * 2);
  ctx.arc(x + h * 0.2, baseY - h * 0.54, h * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

/** A dog mid-walk: body, head, legs, a hint of tail. h is shoulder height. */
function drawDog(ctx: Ctx, x: number, baseY: number, h: number) {
  const bodyL = h * 1.5;

  ctx.beginPath();
  ctx.ellipse(x, baseY - h * 0.58, bodyL / 2, h * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x + bodyL * 0.52, baseY - h * 0.82, h * 0.24, 0, Math.PI * 2);
  ctx.fill();

  // Tail up, ears skipped — at halftone scale they'd only add noise.
  ctx.fillRect(x - bodyL * 0.55, baseY - h * 1.02, h * 0.1, h * 0.5);

  const legW = h * 0.11;
  for (const lx of [-0.38, -0.16, 0.14, 0.36]) {
    ctx.fillRect(x + bodyL * lx, baseY - h * 0.5, legW, h * 0.5);
  }
}

/** A small shop: main block with a raised sign, awning step on one side. */
function drawShop(ctx: Ctx, x: number, baseY: number, h: number) {
  const hw = h * 0.52;
  ctx.fillRect(x - hw, baseY - h * 0.72, hw * 2, h * 0.72);
  ctx.fillRect(x - hw * 0.62, baseY - h * 0.94, hw * 1.24, h * 0.26);
  ctx.fillRect(x - hw * 1.18, baseY - h * 0.5, hw * 0.5, h * 0.07);
}

/** A street cart: box, pole and umbrella. */
function drawCart(ctx: Ctx, x: number, baseY: number, h: number) {
  ctx.fillRect(x - h * 0.36, baseY - h * 0.48, h * 0.72, h * 0.48);
  ctx.fillRect(x - h * 0.025, baseY - h * 0.78, h * 0.05, h * 0.34);

  ctx.beginPath();
  ctx.moveTo(x - h * 0.56, baseY - h * 0.72);
  ctx.lineTo(x + h * 0.56, baseY - h * 0.72);
  ctx.lineTo(x, baseY - h * 1.04);
  ctx.closePath();
  ctx.fill();
}

type FigureKind = "person" | "tree" | "dog" | "shop" | "cart";

const DRAW: Record<FigureKind, (ctx: Ctx, x: number, baseY: number, h: number) => void> = {
  person: drawPerson,
  tree: drawTree,
  dog: drawDog,
  shop: drawShop,
  cart: drawCart,
};

/** Relative height of each figure kind against the row's person height. */
const KIND_SCALE: Record<FigureKind, number> = {
  person: 1,
  tree: 1.2,
  dog: 0.32,
  shop: 1.05,
  cart: 0.55,
};

/**
 * V envelope: 1 at the edges, low in the middle, so the silhouette digs a
 * valley under the hero copy. The floor keeps the centre populated — short
 * and low, never empty — while the exponent keeps the walls steep.
 */
function vEnvelope(x: number, w: number) {
  const t = Math.min(1, Math.abs(x - w / 2) / (w / 2));
  return 0.3 + 0.7 * Math.pow(t, 1.35);
}

/** Skyline: a continuous run of towers whose height follows the V. */
function drawSkyline(
  ctx: Ctx,
  w: number,
  h: number,
  rand: () => number,
) {
  let x = -20;
  while (x < w + 20) {
    const bw = 34 + rand() * 52;
    const env = vEnvelope(x + bw / 2, w);
    const bh = (70 + rand() * 330) * env;
    const style = rand();

    if (bh >= 16) {
      ctx.fillRect(x, h - bh, bw, bh);
      if (style < 0.3) {
        // Stepped crown.
        ctx.fillRect(x + bw * 0.25, h - bh - bh * 0.12, bw * 0.5, bh * 0.12);
      } else if (style < 0.45) {
        // Antenna.
        ctx.fillRect(x + bw * 0.47, h - bh - bh * 0.22, bw * 0.06 + 2, bh * 0.22);
      }
    }
    x += bw + 8 + rand() * 14;
  }
}

/** A suspension bridge crossing the valley floor, well under the copy. */
function drawBridge(ctx: Ctx, w: number, h: number) {
  const deckY = h * 0.82;
  const towerX = [w * 0.26, w * 0.74];
  const towerTop = h * 0.44;

  // Deck.
  ctx.fillRect(0, deckY, w, 9);

  // Portal-frame towers with crossbars, plus piers down to the water line.
  for (const tx of towerX) {
    for (const leg of [-11, 5]) {
      ctx.fillRect(tx + leg, towerTop, 6, h - towerTop);
    }
    for (const cy of [0.55, 0.68]) {
      ctx.fillRect(tx - 11, h * cy, 22, 5);
    }
  }

  // Main cables: parabolas between tower tops, dipping to the deck mid-span,
  // and side spans running down to the deck ends.
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(towerX[0], towerTop);
  ctx.quadraticCurveTo(w / 2, deckY + 4, towerX[1], towerTop);
  ctx.moveTo(towerX[0], towerTop);
  ctx.quadraticCurveTo(towerX[0] - w * 0.13, deckY - h * 0.02, 0, deckY);
  ctx.moveTo(towerX[1], towerTop);
  ctx.quadraticCurveTo(towerX[1] + w * 0.13, deckY - h * 0.02, w, deckY);
  ctx.stroke();

  // Suspenders: thin verticals from the main span cable to the deck.
  ctx.lineWidth = 3;
  ctx.beginPath();
  const span = towerX[1] - towerX[0];
  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    const sx = towerX[0] + span * t;
    // Point on the quadratic at parameter t.
    const sy =
      (1 - t) * (1 - t) * towerTop +
      2 * (1 - t) * t * (deckY + 4) +
      t * t * towerTop;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx, deckY);
  }
  ctx.stroke();
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

      // 1. Two silhouettes, offscreen: everything, and the consented subset.
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

      const rand = mulberry32(20260716);

      // Backdrop first: skyline behind everything, then the bridge crossing
      // the valley. Both stay in the base colour — accent is for figures.
      drawSkyline(all, w, h, rand);
      drawBridge(all, w, h);

      // Back row sits high and small; the front row overlaps it, which is what
      // makes the mass read as depth rather than as stripes. Trees and shops
      // stay in the back rows; dogs and carts live at street level.
      const rows: {
        height: number;
        baseY: number;
        step: number;
        kinds: FigureKind[];
      }[] = [
        {
          height: 158,
          baseY: h * 0.66,
          step: 62,
          kinds: ["person", "tree", "shop", "person", "person"],
        },
        {
          height: 224,
          baseY: h * 0.84,
          step: 90,
          kinds: ["person", "tree", "shop", "cart", "person"],
        },
        {
          height: 304,
          baseY: h * 1.14,
          step: 128,
          kinds: ["person", "dog", "cart", "person", "tree"],
        },
      ];
      for (const row of rows) {
        // Start off-canvas so the scene never looks like it begins at the edge.
        for (let x = -row.step; x < w + row.step; x += row.step) {
          const jitterX = (rand() - 0.5) * row.step * 0.4;
          const kind = row.kinds[Math.floor(rand() * row.kinds.length)];
          const jitterH = 1 + (rand() - 0.5) * 0.18;
          const isConsented = rand() < CONSENT_SHARE;
          // Burn a draw either way so the V never reshuffles neighbours.
          const keep = rand();

          const px = x + jitterX;
          const env = vEnvelope(px, w);
          // The centre thins out a little, but never empties.
          if (keep > 0.55 + env) continue;

          const fh = row.height * jitterH * KIND_SCALE[kind] * env;
          if (fh < 14) continue;

          // Valley figures also sit lower, so the centre clears the buttons.
          const baseY = row.baseY + (1 - env) * h * 0.22;
          DRAW[kind](all, px, baseY, fh);
          if (isConsented) {
            DRAW[kind](consented, px, baseY, fh);
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
