import {
  BoxFaces,
  Coin,
  Flat,
  fromScreen,
  iso,
  Packets,
  pts,
  type V3,
} from "./iso";

/**
 * One drawing per step of "how it works", in the same isometric kit as the
 * system diagram. Each is laid out by where things should land on screen
 * (`fromScreen`) and drawn in world units from there, each inside a frame of
 * the same proportions, so the three swap in place without the plate around
 * them changing size. The payout's frame is shorter by the ledger under it.
 */

/** A slab centred on a screen position. */
function slab(sx: number, sy: number, w: number, d: number, h: number) {
  const [cx, cy] = fromScreen(sx, sy);
  return { x: cx - w / 2, y: cy - d / 2, w, d, h, cx, cy };
}

type Slab = ReturnType<typeof slab>;

/** A point on a slab's top face, offset (u, v) from its centre in world units. */
const onTop = (b: Slab, u: number, v: number): V3 => [b.cx + u, b.cy + v, b.h];

/** Screen position of a slab's centre on the ground. */
const centre = (b: Slab) => iso([b.cx, b.cy, 0]);

/** A curve from one screen point to another that leaves and arrives level. */
function curve([ax, ay]: [number, number], [bx, by]: [number, number], pull = 0.45) {
  const k = (bx - ax) * pull;
  return `M${ax},${ay} C${ax + k},${ay} ${bx - k},${by} ${bx},${by}`;
}

function Wire({ d }: { d: string }) {
  return <path d={d} fill="none" className="stroke-star/20" strokeWidth="1" />;
}

/** Mono caption set in screen space beside a part of the drawing. */
function Tag({
  x,
  y,
  children,
  anchor = "start",
  tone = "faint",
}: {
  x: number;
  y: number;
  children: string;
  anchor?: "start" | "middle" | "end";
  tone?: "faint" | "bright" | "signal";
}) {
  const fill =
    tone === "bright" ? "fill-star" : tone === "signal" ? "fill-signal" : "fill-star-faint";
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="middle"
      className={`font-mono text-[11px] tracking-[0.08em] ${fill}`}
    >
      {children}
    </text>
  );
}

/* ------------------------------------------------------- 1.1 · Connect */

/** Line icons for the four sources, drawn on a tile's top face. */
const ICONS: Record<string, (b: Slab) => V3[][]> = {
  browsing: (b) => [
    Array.from({ length: 13 }, (_, i) => {
      const t = (i / 12) * Math.PI * 2;
      return onTop(b, -3 + Math.cos(t) * 8, -3 + Math.sin(t) * 8);
    }),
    [onTop(b, 3, 3), onTop(b, 11, 11)],
  ],
  health: (b) => [
    [
      onTop(b, -13, 0),
      onTop(b, -5, 0),
      onTop(b, -2, -9),
      onTop(b, 2, 9),
      onTop(b, 5, 0),
      onTop(b, 13, 0),
    ],
  ],
  purchases: (b) => [
    [onTop(b, -9, -5), onTop(b, 9, -5), onTop(b, 9, 10), onTop(b, -9, 10), onTop(b, -9, -5)],
    [onTop(b, -4, -5), onTop(b, -4, -11), onTop(b, 4, -11), onTop(b, 4, -5)],
  ],
  media: (b) => [[onTop(b, -7, -9), onTop(b, 10, 0), onTop(b, -7, 9), onTop(b, -7, -9)]],
};

const SOURCES = [
  { id: "browsing", label: "BROWSING" },
  { id: "health", label: "HEALTH" },
  { id: "purchases", label: "PURCHASES" },
  { id: "media", label: "MEDIA" },
];

export function ConnectFigure() {
  const view = "-284 -152 524 300";
  const tiles = SOURCES.map((s, i) => ({ ...s, b: slab(-150, -114 + i * 76, 44, 44, 8) }));
  const phone = slab(150, 6, 58, 104, 9);
  const [px, py] = centre(phone);

  return (
    <svg viewBox={view} className="h-auto w-full" aria-hidden="true">
      {tiles.map(({ id, b }, i) => {
        const d = curve(centre(b), [px, py]);
        return (
          <g key={id}>
            <Wire d={d} />
            <Packets d={d} count={1} dur={3.6 + (i % 2) * 0.7}>
              <Cube4 />
            </Packets>
          </g>
        );
      })}

      {tiles.map(({ id, label, b }) => {
        const [, ty] = centre(b);
        return (
          <g key={id}>
            <BoxFaces {...b} bright />
            <Flat x={b.x + 6} y={b.y + 6} z={b.h} w={b.w - 12} d={b.d - 12} className="stroke-star/25" />
            {ICONS[id](b).map((line, k) => (
              <polyline
                key={k}
                points={pts(...line)}
                fill="none"
                className="stroke-star"
                strokeWidth="1.25"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            <Tag x={-206} y={ty} anchor="end">
              {label}
            </Tag>
          </g>
        );
      })}

      {/* Your phone: where it all lands, still yours. */}
      <BoxFaces {...phone} bright />
      <Flat x={phone.x + 6} y={phone.y + 8} z={phone.h} w={phone.w - 12} d={phone.d - 16} />
      {Array.from({ length: 8 }).map((_, i) => (
        <Flat
          key={i}
          x={phone.x + 12 + (i % 2) * 18}
          y={phone.y + 16 + Math.floor(i / 2) * 20}
          z={phone.h}
          w={13}
          d={14}
          className="stroke-star/50"
          fill={i === 2 || i === 5 ? "rgba(237,237,237,0.6)" : "none"}
        />
      ))}
      <Tag x={px} y={py + 92} anchor="middle" tone="bright">
        YOUR PHONE
      </Tag>
      <Tag x={px} y={py + 110} anchor="middle">
        NOTHING SHARED YET
      </Tag>
    </svg>
  );
}

/** A smaller packet than the diagram's: these wires are shorter. */
function Cube4() {
  return (
    <g className="stroke-star" fill="var(--color-night)" strokeWidth="1" strokeLinejoin="round">
      <polygon points={pts([4.5, -4.5, 0], [4.5, 4.5, 0], [4.5, 4.5, 9], [4.5, -4.5, 9])} />
      <polygon points={pts([-4.5, 4.5, 0], [4.5, 4.5, 0], [4.5, 4.5, 9], [-4.5, 4.5, 9])} />
      <polygon points={pts([-4.5, -4.5, 9], [4.5, -4.5, 9], [4.5, 4.5, 9], [-4.5, 4.5, 9])} />
    </g>
  );
}

/* ------------------------------------------------------- 1.2 · Approve */

const BUYERS = [
  { name: "ROBOTICS LAB", terms: "12 MO", open: true },
  { name: "AD NETWORK", terms: "DECLINED", open: false },
  { name: "UNIVERSITY", terms: "6 MO", open: true },
];

/** A gate across a lane at screen (gx, ly): posts either side, a barrier
 *  between them when it is shut, a lit cap when it is open. Across the lane
 *  on the ground is straight down the screen in this projection. */
function Gate({ gx, ly, open }: { gx: number; ly: number; open: boolean }) {
  const half = 15;
  const tall = 24;
  const a: [number, number] = [gx, ly - half];
  const b: [number, number] = [gx, ly + half];
  return (
    <g strokeWidth="1" strokeLinecap="round">
      {!open && (
        <g>
          <polygon
            points={`${a[0]},${a[1]} ${b[0]},${b[1]} ${b[0]},${b[1] - tall} ${a[0]},${a[1] - tall}`}
            fill="var(--color-night)"
            className="stroke-star/60"
          />
          {[0.3, 0.55, 0.8].map((t) => (
            <line
              key={t}
              x1={gx}
              y1={a[1] - tall * t + 2}
              x2={gx}
              y2={b[1] - tall * t - 2}
              className="stroke-star/35"
            />
          ))}
        </g>
      )}
      {[a, b].map(([x, y]) => (
        <g key={y}>
          <line x1={x} y1={y} x2={x} y2={y - tall - 4} className="stroke-star" />
          <circle cx={x} cy={y - tall - 6} r="2" className={open ? "fill-signal" : "fill-star-ghost"} />
        </g>
      ))}
    </g>
  );
}

export function ApproveFigure() {
  const view = "-256 -152 524 300";
  const data = slab(-196, 0, 58, 58, 26);
  const [dx, dy] = centre(data);
  const gateX = 70;

  return (
    <svg viewBox={view} className="h-auto w-full" aria-hidden="true">
      {BUYERS.map((buyer, i) => {
        const ly = -104 + i * 104;
        const buyerBox = slab(196, ly, 44, 44, 12);
        const [bx] = centre(buyerBox);
        // A shut lane's wire stops at its gate, and so do its packets.
        const end: [number, number] = buyer.open ? [bx, ly] : [gateX - 4, ly];
        const d = `${curve([dx, dy], [gateX - 60, ly], 0.5)} L${end[0]},${end[1]}`;
        return (
          <g key={buyer.name}>
            <Wire d={d} />
            <Packets d={d} count={2} dur={buyer.open ? 4.4 : 3.2}>
              <Cube4 />
            </Packets>
          </g>
        );
      })}

      {/* The dataset: a block with its records showing on top. */}
      <BoxFaces {...data} bright />
      {[0, 1, 2, 3].map((i) => (
        <Flat
          key={i}
          x={data.x + 8 + (i % 2) * 22}
          y={data.y + 8 + Math.floor(i / 2) * 22}
          z={data.h}
          w={18}
          d={18}
          className="stroke-star/50"
        />
      ))}
      <Tag x={dx} y={dy + 66} anchor="middle" tone="bright">
        YOUR DATASET
      </Tag>

      {BUYERS.map((buyer, i) => {
        const ly = -104 + i * 104;
        const buyerBox = slab(196, ly, 44, 44, 12);
        return (
          <g key={buyer.name}>
            <Gate gx={gateX} ly={ly} open={buyer.open} />
            <BoxFaces {...buyerBox} bright={buyer.open} />
            <Tag x={gateX + 14} y={ly + 30} tone={buyer.open ? "signal" : "faint"}>
              {buyer.open ? `✓ ${buyer.terms}` : buyer.terms}
            </Tag>
            <Tag x={196} y={ly + 38} anchor="middle" tone={buyer.open ? "bright" : "faint"}>
              {buyer.name}
            </Tag>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------- 1.3 · Paid */

const LIT = new Set([1, 3, 8]);

export function PaidFigure() {
  const view = "-262 -128 524 222";
  // Spaced so the coins spend most of each trip in the open, not under a box.
  const rack = slab(-200, -10, 56, 56, 18);
  const vault = slab(0, -10, 96, 96, 30);
  const phone = slab(200, -10, 46, 82, 9);
  const [rx, ry] = centre(rack);
  const [vx, vy] = centre(vault);
  const [px, py] = centre(phone);
  const into = `M${rx},${ry} L${vx},${vy}`;
  const out = `M${vx},${vy} L${px},${py}`;

  return (
    <svg viewBox={view} className="h-auto w-full" aria-hidden="true">
      <Wire d={into} />
      <Wire d={out} />
      <Packets d={into} count={2} dur={4.8}>
        <Coin />
      </Packets>
      <Packets d={out} count={2} dur={4.8}>
        <Coin />
      </Packets>

      {/* The buyer: a rack of three units. */}
      {[0, 20, 40].map((z, i) => (
        <BoxFaces key={z} {...rack} z={z} bright={i === 2} />
      ))}

      {/* The contract, holding the money until you sign for it. */}
      <BoxFaces {...vault} bright />
      <Flat x={vault.x + 8} y={vault.y + 8} z={vault.h} w={vault.w - 16} d={vault.d - 16} />
      {Array.from({ length: 9 }).map((_, i) => (
        <Flat
          key={i}
          x={vault.x + 17 + (i % 3) * 22}
          y={vault.y + 17 + Math.floor(i / 3) * 22}
          z={vault.h}
          w={16}
          d={16}
          className={LIT.has(i) ? "stroke-star" : "stroke-star/30"}
          fill={LIT.has(i) ? "rgba(237,237,237,0.85)" : "none"}
        />
      ))}

      {/* Your wallet. */}
      <BoxFaces {...phone} bright />
      <Flat x={phone.x + 5} y={phone.y + 7} z={phone.h} w={phone.w - 10} d={phone.d - 14} />
      <circle cx={px} cy={py - phone.h - 2} r="2.5" className="fill-signal" />

      <Tag x={rx} y={ry + 80} anchor="middle">
        AI TEAM PAYS
      </Tag>
      <Tag x={vx} y={vy + 80} anchor="middle" tone="bright">
        CONTRACT · STELLAR
      </Tag>
      <Tag x={px} y={py + 80} anchor="middle">
        YOU SIGN, IT PAYS
      </Tag>
    </svg>
  );
}

/**
 * The ledger under the payout drawing: settlements scrolling past, every one
 * with a hash. Illustrative rows — the plate says so — in the format the
 * dashboard shows real ones in.
 */
const LEDGER = [
  ["9c1e…a4f2", "+1.29 USDC"],
  ["3f0b…7d1c", "+1.51 USDC"],
  ["b82a…19e6", "+1.32 USDC"],
  ["e4d7…c03b", "+1.15 USDC"],
  ["71aa…5e90", "+1.50 USDC"],
];

export function Ledger() {
  const rows = [...LEDGER, ...LEDGER];
  return (
    <div className="ledger relative mx-5 h-[4.5rem] overflow-hidden border-t border-line font-mono text-[0.6875rem] text-star-faint">
      <ul className="ledger-track">
        {rows.map(([hash, amount], i) => (
          <li key={i} className="flex h-6 items-center justify-between">
            <span>
              <span className="text-star-ghost">tx </span>
              {hash}
            </span>
            <span className="text-star-dim">{amount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
