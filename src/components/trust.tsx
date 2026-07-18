import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const RECEIPT = [
  { k: "receipt_id", v: "rcpt_8f2c4a19" },
  { k: "contributor", v: "anon_4471" },
  { k: "dataset", v: "dashcam · EU · 30d" },
  { k: "purpose", v: "commercial training" },
  { k: "buyer", v: "Vantage Robotics" },
  { k: "granted", v: "2026-05-02" },
  { k: "expires", v: "2026-11-02" },
  { k: "revocable", v: "any time" },
];

const PILLARS = [
  {
    title: "Pseudonymous by default",
    body: "Identity is stripped at ingest. Buyers get the signal, never the person behind it.",
  },
  {
    title: "Revocation that actually propagates",
    body: "Withdraw consent and every downstream buyer is notified within 24 hours, contractually bound to delete.",
  },
  {
    title: "GDPR, CCPA and the AI Act",
    body: "Built for the regimes that already exist and the ones arriving. Data residency in the EU, US and UK.",
  },
  {
    title: "Audited end to end",
    body: "SOC 2 Type II. Independent annual review of consent flows, payouts and buyer terms.",
  },
];

export function Trust() {
  return (
    <section
      id="trust"
      className="relative border-t border-rule-dark bg-ink-900"
    >
      <div className="mx-auto max-w-6xl px-6 pt-4 pb-28 sm:pb-36">
        <SectionHeading
          tone="dark"
          eyebrow="Consent & compliance"
          title="Consent isn't a checkbox. It's a receipt."
          body="Every time data changes hands, both sides get the same signed record. The contributor can revoke it. The buyer can prove it. Nobody has to take anyone's word for it."
          align="center"
        />

        <div className="mt-16 grid items-start gap-12 lg:grid-cols-[0.9fr_1fr] lg:gap-16">
          <Reveal>
            <div className="overflow-hidden rounded-xl border border-rule-dark bg-ink-950">
              <div className="flex items-center justify-between border-b border-rule-dark px-5 py-3.5">
                <span className="font-mono text-[0.6875rem] tracking-[0.18em] text-chalk-faint uppercase">
                  Consent receipt
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[0.625rem] text-slate-soft">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-soft" />
                  ACTIVE
                </span>
              </div>

              <dl className="divide-y divide-rule-dark">
                {RECEIPT.map((row) => (
                  <div
                    key={row.k}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <dt className="font-mono text-xs text-chalk-faint">
                      {row.k}
                    </dt>
                    <dd className="font-mono text-xs text-chalk-dim">
                      {row.v}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="flex items-center justify-between gap-4 border-t border-rule-dark bg-ink-900/60 px-5 py-4">
                <span className="font-mono text-xs text-chalk-faint">
                  ed25519 signature
                </span>
                <span className="flex items-center gap-1.5 font-mono text-xs text-chalk">
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5 text-slate-soft"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                  >
                    <path
                      d="M3 8.5l3.5 3.5L13 5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  verified
                </span>
              </div>
            </div>
          </Reveal>

          <ul className="space-y-px">
            {PILLARS.map((pillar, i) => (
              <Reveal as="li" key={pillar.title} delay={i * 80}>
                <div className="border-t border-rule-dark py-6">
                  <h3 className="text-base font-medium text-chalk">
                    {pillar.title}
                  </h3>
                  <p className="mt-2 text-sm text-pretty text-chalk-dim">
                    {pillar.body}
                  </p>
                </div>
              </Reveal>
            ))}
            <div className="border-t border-rule-dark" />
          </ul>
        </div>
      </div>
    </section>
  );
}
