/**
 * The protocol as an isometric wireframe: a contributor's phone, the consent
 * receipt it signs, the contract on Stellar that holds both the receipt and
 * the money, and the AI team on the far side. Data and consent travel right;
 * the payout comes back along the near rail.
 *
 * Packets — small cubes — ride the wires the way a request would. Drawn
 * with the kit in ./iso.
 */

import {
  BoxFaces,
  Flat,
  iso,
  Label,
  Packets,
  pts,
  wire,
  type V3,
} from "./iso";

/** The 3×3 crowd from the logo, laid on top of the contract. */
const LIT = new Set([1, 3, 8]);

/**
 * World positions along the screen's horizontal. In this projection a step of
 * (+t, −t) moves straight right on screen and never down, so the chain reads
 * left to right like a sentence and every label gets the same baseline,
 * while the boxes themselves stay isometric.
 */
const along = (t: number, depth = 0) => ({ cx: t + depth, cy: -t + depth });

/** A box placed by its centre on the ground. */
function boxAt(t: number, w: number, d: number, h: number) {
  const { cx, cy } = along(t);
  return { x: cx - w / 2, y: cy - d / 2, w, d, h, cx, cy };
}

/** How far toward the viewer the payout rail runs. */
const NEAR = 118;

export function SystemDiagram({ className = "" }: { className?: string }) {
  const phone = boxAt(0, 46, 82, 7);
  const receipt = boxAt(136, 58, 72, 3);
  const contract = boxAt(282, 120, 120, 34);
  const rack = boxAt(436, 78, 78, 60);

  const ground = (b: { cx: number; cy: number }, depth = 0): V3 => [
    b.cx + depth,
    b.cy + depth,
    0,
  ];
  /** The farthest top corner: the highest point of a box on screen. */
  const crown = (b: { x: number; y: number; h: number }, top = b.h): V3 => [
    b.x,
    b.y,
    top,
  ];

  // Data and consent run right, through every node; the payout drops out of
  // the contract, runs back along the near side and climbs into the phone.
  const forward = wire([ground(phone), ground(rack)]);
  const payout = wire([
    ground(contract),
    ground(contract, NEAR),
    ground(phone, NEAR),
    ground(phone),
  ]);

  const [left] = iso([phone.x, phone.y + phone.d, 0]);
  const [right] = iso([rack.x + rack.w, rack.y, 0]);
  const [, top] = iso(crown(contract));
  const [, bottom] = iso(ground(phone, NEAR));
  const vb = [left - 48, top - 96, right - left + 96, bottom - top + 150];

  return (
    <svg
      viewBox={vb.join(" ")}
      className={className}
      role="img"
      aria-label="Diagram: a contributor's phone signs a consent receipt, the receipt is held by a contract on Stellar, the contract licenses data to an AI team, and the payout returns to the contributor."
    >
      <defs>
        {/* The floor fades out toward the frame instead of stopping at it. */}
        <radialGradient id="floor-fade" cx="50%" cy="55%" r="60%">
          <stop offset="0.35" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="floor-mask" maskContentUnits="userSpaceOnUse">
          <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill="url(#floor-fade)" />
        </mask>
      </defs>

      <g className="stroke-star/[0.07]" strokeWidth="1" mask="url(#floor-mask)">
        {Array.from({ length: 24 }).map((_, i) => {
          const x = -220 + i * 44;
          return <line key={`gx${i}`} x1={iso([x, -640, 0])[0]} y1={iso([x, -640, 0])[1]} x2={iso([x, 300, 0])[0]} y2={iso([x, 300, 0])[1]} />;
        })}
        {Array.from({ length: 22 }).map((_, i) => {
          const y = -640 + i * 44;
          return <line key={`gy${i}`} x1={iso([-220, y, 0])[0]} y1={iso([-220, y, 0])[1]} x2={iso([820, y, 0])[0]} y2={iso([820, y, 0])[1]} />;
        })}
      </g>

      {/* Wires and their packets go down before the boxes, so each box
          covers the wire under it and a packet passing through a node
          disappears into it and comes out the other side. */}
      <path d={forward} fill="none" className="stroke-star/20" strokeWidth="1" />
      <path d={payout} fill="none" className="stroke-star/20" strokeWidth="1" />
      <Packets d={forward} count={4} dur={9} />
      <Packets d={payout} count={2} dur={7} />

      {/* Phone: a slab with a screen and a few cells of data on it. */}
      <BoxFaces {...phone} bright />
      <Flat x={phone.x + 5} y={phone.y + 7} z={phone.h} w={phone.w - 10} d={phone.d - 14} />
      {Array.from({ length: 6 }).map((_, i) => (
        <Flat
          key={i}
          x={phone.x + 10 + (i % 2) * 15}
          y={phone.y + 14 + Math.floor(i / 2) * 18}
          z={phone.h}
          w={11}
          d={12}
          className="stroke-star/60"
          fill={i === 1 || i === 4 ? "rgba(237,237,237,0.55)" : "none"}
        />
      ))}

      {/* Receipt: three sheets, the top one written on and signed. */}
      {[0, 6, 12].map((z, i) => (
        <BoxFaces key={z} {...receipt} x={receipt.x + i * 3} y={receipt.y - i * 3} z={z} bright={i === 2} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <Flat
          key={i}
          x={receipt.x + 16 + i * 10}
          y={receipt.y + 4}
          z={15}
          w={0.01}
          d={i === 3 ? 26 : 50}
          className="stroke-star/50"
        />
      ))}
      <polyline
        points={pts([receipt.x + 52, receipt.y + 44, 15], [receipt.x + 56, receipt.y + 50, 15], [receipt.x + 50, receipt.y + 60, 15])}
        fill="none"
        className="stroke-signal"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Contract: the block that holds the receipt and the money. */}
      <BoxFaces {...contract} bright />
      <Flat x={contract.x + 10} y={contract.y + 10} z={contract.h} w={contract.w - 20} d={contract.d - 20} />
      {Array.from({ length: 9 }).map((_, i) => (
        <Flat
          key={i}
          x={contract.x + 24 + (i % 3) * 26}
          y={contract.y + 24 + Math.floor(i / 3) * 26}
          z={contract.h}
          w={18}
          d={18}
          className={LIT.has(i) ? "stroke-star" : "stroke-star/30"}
          fill={LIT.has(i) ? "rgba(237,237,237,0.85)" : "none"}
        />
      ))}

      {/* AI team: a rack of three units. */}
      {[0, 22, 44].map((z, i) => (
        <BoxFaces key={z} x={rack.x} y={rack.y} z={z} w={rack.w} d={rack.d} h={16} bright={i === 2} />
      ))}
      {[0, 22, 44].map((z) => (
        <Flat key={`led${z}`} x={rack.x + rack.w} y={rack.y + 10} z={z + 6} w={0.01} d={14} className="stroke-star/70" />
      ))}

      {/* Node labels share a baseline above the tallest box, so they read as
          one row of column headings. */}
      {(
        [
          [phone, phone.h, "YOU"],
          [receipt, 15, "CONSENT RECEIPT"],
          [contract, contract.h, "CONTRACT · STELLAR"],
          [rack, rack.h, "AI TEAM"],
        ] as const
      ).map(([box, height, text]) => {
        const at = crown(box, height);
        return (
          <Label key={text} at={at} dy={top - 44 - iso(at)[1]}>
            {text}
          </Label>
        );
      })}

      {/* Rail labels sit under their rail, on a second shared baseline. */}
      <Label at={[(phone.cx + receipt.cx) / 2, (phone.cy + receipt.cy) / 2, 0]} dy={34} dim>
        SIGNED
      </Label>
      <Label at={[(contract.cx + rack.cx) / 2, (contract.cy + rack.cy) / 2, 0]} dy={34} dim>
        LICENCE
      </Label>
      <Label
        at={[(phone.cx + contract.cx) / 2 + NEAR, (phone.cy + contract.cy) / 2 + NEAR, 0]}
        dy={30}
        dim
      >
        PAYOUT · USDC
      </Label>
    </svg>
  );
}
