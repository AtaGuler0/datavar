import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const STEPS = [
  {
    n: "01",
    title: "Connect what you already have",
    body: "Link the accounts, devices and files that hold your data. Access is read-only, scoped, and revocable the second you change your mind.",
    detail: ["Browsing & search", "Health & wearables", "Purchases", "Media"],
  },
  {
    n: "02",
    title: "Nothing leaves until you approve it",
    body: "You approve each dataset, each buyer, and each purpose separately. Every approval is written as a signed consent receipt with an expiry date.",
    detail: ["Per-buyer control", "Purpose limits", "Expiring by default"],
  },
  {
    n: "03",
    title: "Get paid every month",
    body: "Rare, high-signal data earns more than common data. Take it as cash to your bank, or as stablecoin to your wallet. Your call, every payout.",
    detail: ["Bank transfer", "PayPal", "USDC"],
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="bg-paper">
      <div className="mx-auto max-w-6xl px-6 py-28 sm:py-36">
        <SectionHeading
          eyebrow="For people"
          title={
            <>
              You produce the data.
              <br />
              You should set the terms.
            </>
          }
          body="Right now your data is taken quietly and monetised by someone else. Datavar flips the default: nothing moves until you say so, and when it moves, you're paid."
        />

        <ol className="mt-20">
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.n} delay={i * 90}>
              <div className="grid gap-5 border-t border-rule py-10 sm:grid-cols-[auto_1fr_1fr] sm:gap-10">
                <span className="font-mono text-xs text-ink-faint">
                  {step.n}
                </span>

                <h3 className="text-xl font-medium tracking-tight text-balance text-ink sm:text-2xl">
                  {step.title}
                </h3>

                <div>
                  <p className="text-[0.9375rem] text-pretty text-ink-dim">
                    {step.body}
                  </p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {step.detail.map((d) => (
                      <li
                        key={d}
                        className="rounded-md border border-rule bg-paper-raised px-2.5 py-1 font-mono text-[0.6875rem] text-ink-faint"
                      >
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
        <div className="border-t border-rule" />
      </div>
    </section>
  );
}
