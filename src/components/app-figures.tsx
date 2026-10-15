import { BoxFaces, Flat, Label, Packets, pts, wire, type V3 } from "./iso";

/**
 * One drawing per place in the app, each about the page it sits on rather
 * than the same picture everywhere: the wallet that is your account, the
 * licences a buyer holds, the card a licence names them by. Same isometric
 * kit and line weight as the landing page's figures.
 */

/** A short rule on a face, for the lines of text a card carries. */
function Rule({ from, to, bright = false }: { from: V3; to: V3; bright?: boolean }) {
  return (
    <polyline
      points={pts(from, to)}
      fill="none"
      className={bright ? "stroke-star/80" : "stroke-star/35"}
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  );
}

/** A small signature mark riding a wire: a diamond, not a parcel. */
function Mark() {
  return <polygon points="0,-5 4,0 0,5 -4,0" className="fill-night stroke-star" strokeWidth="1" />;
}

/* ------------------------------------------------- overview · the wallet */

/** The wallet is the account: one signature from the key to everything it owns. */
export function WalletFigure() {
  const d = wire([[-38, 0, 0], [60, 0, 0]]);
  return (
    <svg viewBox="-205 -150 440 250" className="h-auto w-full" aria-hidden="true">
      <path d={d} fill="none" className="stroke-star/30" strokeDasharray="4 5" strokeWidth="1" />
      <Packets d={d} count={2} dur={3.2}>
        <Mark />
      </Packets>

      {/* The wallet: a card with its chip. */}
      <BoxFaces x={-150} y={-35} w={110} d={70} h={7} bright />
      <Flat x={-128} y={-20} z={7} w={22} d={18} className="stroke-star/70" />
      <Rule from={[-95, 18, 7]} to={[-52, 18, 7]} />
      <Rule from={[-95, 25, 7]} to={[-70, 25, 7]} />

      {/* The account: datasets, receipts, payouts, stacked on one key. */}
      {[0, 1, 2].map((i) => (
        <BoxFaces key={i} x={62} y={-32} z={i * 15} w={66} d={64} h={11} bright={i === 2} />
      ))}

      <Label at={[-95, -35, 7]} dy={-38}>
        WALLET · YOUR KEY
      </Label>
      <Label at={[95, -32, 41]} dy={-34} dim>
        DATA · RECEIPTS · PAYOUTS
      </Label>
      <Label at={[0, 0, 0]} dx={-8} dy={36} anchor="end" dim>
        ONE SIGNATURE
      </Label>
    </svg>
  );
}

/* ------------------------------------------------ licences · the shelf */

/**
 * The licences a wallet holds, standing like files on a shelf, the newest at
 * the front; and a download leaving the front one for the tray, checked
 * against its receipt on the way out.
 */
export function LicenceShelfFigure() {
  const W = 72;
  const D = 5;
  const H = 88;
  const cards = [0, 1, 2].map((i) => ({ x: -40, y: -64 + i * 24 }));
  const front = cards[cards.length - 1];
  const d = wire([[front.x + W / 2, front.y + D + 2, 0], [front.x + W / 2, 70, 0]]);

  return (
    <svg viewBox="-170 -165 420 285" className="h-auto w-full" aria-hidden="true">
      {/* The tray the file lands in. */}
      <Flat x={-30} y={58} z={0} w={52} d={44} className="stroke-star/45 [stroke-dasharray:4_4]" />
      <path d={d} fill="none" className="stroke-star/30" strokeDasharray="4 5" strokeWidth="1" />

      {cards.map((c, i) => {
        const last = i === cards.length - 1;
        const face = c.y + D;
        return (
          <g key={i}>
            <BoxFaces x={c.x} y={c.y} w={W} d={D} h={H} bright={last} />
            {[H - 16, H - 26, H - 34].map((z, k) => (
              <Rule
                key={z}
                from={[c.x + 10, face, z]}
                to={[c.x + (k === 0 ? W - 14 : k === 1 ? W - 24 : W - 34), face, z]}
                bright={last && k === 0}
              />
            ))}
            {last && (
              // A tick on the front licence: its receipt still holds.
              <polyline
                points={pts([c.x + 12, face, 22], [c.x + 20, face, 15], [c.x + 34, face, 32])}
                fill="none"
                className="stroke-star"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </g>
        );
      })}

      <Packets d={d} count={2} dur={2.8} />

      <Label at={[cards[0].x + W, cards[0].y, H]} dx={28} dy={-28} anchor="start" dim>
        ONE PER RECEIPT
      </Label>
      <Label at={[front.x, front.y + D, H]} dx={-24} dy={-30} anchor="end">
        LICENCE
      </Label>
      <Label at={[22, 80, 0]} dx={26} dy={30} anchor="start" dim>
        DOWNLOAD · CHECKED FIRST
      </Label>
    </svg>
  );
}

/* ---------------------------------------------- profile · the buyer card */

/** The card a licence names its buyer by, vouched for by the wallet beside it. */
export function BuyerCardFigure() {
  const d = wire([[-92, 0, 0], [-44, 0, 0]]);
  return (
    <svg viewBox="-205 -140 430 240" className="h-auto w-full" aria-hidden="true">
      <path d={d} fill="none" className="stroke-star/30" strokeDasharray="4 5" strokeWidth="1" />
      <Packets d={d} count={1} dur={2.4}>
        <Mark />
      </Packets>

      <BoxFaces x={-150} y={-22} w={56} d={44} h={6} />
      <Flat x={-138} y={-12} z={6} w={14} d={12} className="stroke-star/60" />

      <BoxFaces x={-40} y={-42} w={128} d={84} h={6} bright />
      {/* Photo, then the lines: organisation, contact, purpose. */}
      <Flat x={-26} y={-30} z={6} w={34} d={40} className="stroke-star/70" />
      <Rule from={[20, -26, 6]} to={[76, -26, 6]} bright />
      <Rule from={[20, -16, 6]} to={[64, -16, 6]} />
      <Rule from={[20, -6, 6]} to={[70, -6, 6]} />
      <Rule from={[-26, 24, 6]} to={[76, 24, 6]} />
      <Rule from={[-26, 32, 6]} to={[40, 32, 6]} />

      <Label at={[24, -42, 6]} dy={-34}>
        ORG · CONTACT
      </Label>
      <Label at={[-122, -22, 6]} dy={-34} dim>
        SAID BY THIS WALLET
      </Label>
    </svg>
  );
}
