import { Reveal } from "./reveal";

const STATS = [
  { value: "128,400", label: "contributors paid" },
  { value: "$4.2M", label: "paid out to date" },
  { value: "41", label: "countries" },
  { value: "24h", label: "revocation propagation" },
];

/** 1 dot = 1,000 contributors. The crowd again, now as a unit chart. */
const DOTS = 128;
const LIT = 41;

export function Stats() {
  return (
    <section className="border-t border-rule bg-paper-raised">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-20">
          <Reveal>
            <div>
              <p className="eyebrow text-ink-faint">The crowd, so far</p>
              <div
                className="mt-6 flex flex-wrap gap-[7px]"
                role="img"
                aria-label="Unit chart: 128 dots, one per thousand contributors, of which 41 are highlighted."
              >
                {Array.from({ length: DOTS }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-[7px] w-[7px] ${
                      i < LIT ? "bg-slate" : "bg-ink/15"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-6 font-mono text-[0.6875rem] text-ink-faint">
                <span className="mr-1.5 inline-block h-[7px] w-[7px] bg-slate align-middle" />
                1 dot = 1,000 contributors · accent = earning this month
              </p>
            </div>
          </Reveal>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule">
            {STATS.map((stat, i) => (
              <Reveal key={stat.label} delay={i * 70}>
                {/* col-reverse: term before definition in the DOM (valid <dl>),
                    value above label on screen. */}
                <div className="flex h-full flex-col-reverse gap-2 bg-paper p-6">
                  <dt className="text-sm text-ink-faint">{stat.label}</dt>
                  <dd className="display text-3xl font-medium text-ink tabular-nums sm:text-4xl">
                    {stat.value}
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
