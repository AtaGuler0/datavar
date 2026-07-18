import { Reveal } from "./reveal";

const DOORS = [
  {
    eyebrow: "I have data",
    title: "Start earning from what you already produce",
    body: "Connect a source in about two minutes. First payout at the end of your first full month.",
    action: "Create a free account",
    primary: true,
  },
  {
    eyebrow: "I need data",
    title: "License consented datasets for your models",
    body: "Tell us the cohort you need. We'll come back with availability, price and terms in 48 hours.",
    action: "Talk to sales",
    primary: false,
  },
];

export function Cta() {
  return (
    <section id="cta" className="border-t border-rule bg-paper">
      <div className="mx-auto max-w-6xl px-6 py-28 sm:py-36">
        <Reveal>
          <h2 className="display mx-auto max-w-3xl text-center text-[2.25rem] font-medium text-balance text-ink sm:text-[3.25rem]">
            Two sides of the same market.
            <br />
            <span className="text-ink-faint">Pick yours.</span>
          </h2>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-4xl gap-4 sm:grid-cols-2">
          {DOORS.map((door, i) => (
            <Reveal key={door.eyebrow} delay={i * 100}>
              <div
                className={`flex h-full flex-col justify-between gap-8 rounded-xl border p-7 transition-colors duration-300 sm:p-8 ${
                  door.primary
                    ? "border-slate/30 bg-paper-raised hover:border-slate/60"
                    : "border-rule bg-paper hover:border-rule-strong"
                }`}
              >
                <div>
                  <p className="eyebrow text-ink-faint">{door.eyebrow}</p>
                  <h3 className="mt-4 text-xl font-medium tracking-tight text-balance text-ink">
                    {door.title}
                  </h3>
                  <p className="mt-3 text-sm text-pretty text-ink-dim">
                    {door.body}
                  </p>
                </div>

                <a
                  href="#top"
                  className={`inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-medium transition-colors duration-200 ${
                    door.primary
                      ? "bg-slate-deep text-paper hover:bg-slate"
                      : "border border-rule-strong bg-paper text-ink hover:bg-paper-raised"
                  }`}
                >
                  {door.action}
                </a>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={220}>
          <p className="mt-10 text-center font-mono text-xs text-ink-faint">
            No fees to join · Cash out any time · Revoke any time
          </p>
        </Reveal>
      </div>
    </section>
  );
}
