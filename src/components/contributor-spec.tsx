import { BoxFaces, Flat, iso, Label, Packets, wire } from "./iso";
import { Reveal } from "./reveal";

/**
 * The contributor side opened large: the name, the two-tone line under it,
 * and beside them the whole promise as one drawing. Your data sits in a
 * stack on your side, what it would send rises and stops under the consent
 * plane, and the buyer waits at the end of a wire nothing travels along yet.
 * Under it, the terms of a licence as a strip, every one of them yours.
 */

const TERMS = [
  { key: "Source", value: "What you upload" },
  { key: "Buyer", value: "One at a time" },
  { key: "Purpose", value: "Named, per buyer" },
  { key: "Until", value: "The date you set" },
  { key: "Paid", value: "In USDC, to you" },
];

const STACK = 4;
const SIDE = 76;
const LAYER = 13;
const PLANE = 132;

export function HeldFigure() {
  const half = SIDE / 2;
  const top = STACK * LAYER;
  const [x0, y0] = iso([0, 0, top + 4]);
  const [, y1] = iso([0, 0, PLANE - 4]);
  const rise = `M${x0},${y0} L${x0},${y1}`;

  return (
    <svg viewBox="-150 -205 460 297" className="h-auto w-full" aria-hidden="true">
      {/* The wire to the buyer, dashed: nothing has been licensed. */}
      <path
        d={wire([[half, 0, 0], [150, 0, 0], [150, -110, 0]])}
        fill="none"
        className="stroke-star/25"
        strokeDasharray="4 5"
        strokeWidth="1"
      />
      <BoxFaces x={130} y={-150} w={44} d={44} h={34} />
      <Label at={[152, -150, 34]} dx={8} dy={-30} anchor="end" dim>
        BUYER · WAITING
      </Label>

      {Array.from({ length: STACK }).map((_, i) => (
        <BoxFaces
          key={i}
          x={-half}
          y={-half}
          z={i * LAYER}
          w={SIDE}
          d={SIDE}
          h={LAYER - 3}
          bright={i === STACK - 1}
        />
      ))}

      <Packets d={rise} count={3} dur={3.6} />

      {/* The consent plane: what rises from the stack stops under it. */}
      <Flat
        x={-half - 22}
        y={-half - 22}
        z={PLANE}
        w={SIDE + 44}
        d={SIDE + 44}
        className="stroke-star/45 [stroke-dasharray:4_5]"
      />
      <Label at={[half + 22, -half - 22, PLANE]} dx={14} dy={-24} anchor="start">
        CONSENT · NOT GIVEN
      </Label>
      {/* Set under the stack without a leader, and kept left of the wire's
          dip so the dashes never run through it. */}
      <text
        x={iso([half, half, 0])[0] + 40}
        y={iso([half, half, 0])[1] + 30}
        textAnchor="end"
        className="fill-star-faint font-mono text-[12.5px] tracking-[0.08em]"
      >
        YOUR DATA · ON DEVICE
      </text>
    </svg>
  );
}

export function ContributorSpec() {
  return (
    <div>
      <div className="grid items-end gap-12 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <Reveal>
            <h2 className="-ml-[0.04em] text-[3.5rem] leading-[0.95] font-medium tracking-[-0.055em] text-star sm:text-[6rem] lg:text-[7rem]">
              Contributors
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="mt-10 -ml-[0.08em] text-[1.625rem] leading-[1.15] font-medium tracking-[-0.035em] sm:text-[2.4rem]">
              <span className="text-star">For the data you already make,</span>
              <br className="hidden sm:block" />{" "}
              <span className="text-star-faint">and the terms you set on it.</span>
            </p>
          </Reveal>
        </div>
        <Reveal delay={140}>
          <HeldFigure />
        </Reveal>
      </div>

      {/* A licence's terms, each one filled in by the contributor. */}
      <Reveal delay={180}>
        <dl className="mt-16 grid grid-cols-2 border-y border-line sm:grid-cols-3 lg:mt-20 lg:grid-cols-5">
          {TERMS.map((term, i) => (
            <div
              key={term.key}
              className={`border-line px-2 py-6 text-center sm:px-0 sm:pr-4 sm:text-left lg:border-l lg:py-7 lg:pl-6 lg:first:border-l-0 lg:first:pl-0 ${
                i < TERMS.length - 1 ? "border-b lg:border-b-0" : ""
              } ${
                // Two to a row on a phone leaves the fifth alone: it takes
                // the whole row, so it sits in the middle.
                i === TERMS.length - 1 ? "max-sm:col-span-2" : ""
              }`}
            >
              <dt className="flex items-center justify-center gap-2.5 font-mono text-[0.75rem] tracking-[0.12em] text-star-faint uppercase sm:justify-start">
                <span className="text-star-ghost">{String(i + 1).padStart(2, "0")}</span>
                {term.key}
              </dt>
              <dd className="mt-3 text-[1.0625rem] text-star">{term.value}</dd>
              <dd className="mt-1 font-mono text-[0.6875rem] tracking-[0.08em] text-star-ghost uppercase">
                Set by you
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </div>
  );
}
