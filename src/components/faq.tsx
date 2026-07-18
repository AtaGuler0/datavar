import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const FAQS = [
  {
    q: "Are you selling my identity?",
    a: "No. Identity is stripped when data is ingested and buyers receive pseudonymous records. They can license the fact that a 30-year-old in Berlin walked 8,000 steps; they cannot license you. Re-identification is contractually forbidden and technically monitored.",
  },
  {
    q: "How much will I actually earn?",
    a: "Most contributors land between $20 and $60 a month with three or four sources connected. Rare data pays far more: dashcam footage, clinical wearables, and low-resource languages are the current premiums. Anyone promising you thousands is lying.",
  },
  {
    q: "What happens if I change my mind?",
    a: "Revoke any consent from your dashboard and it stops immediately. Buyers are notified within 24 hours and are contractually required to delete the affected records. Data already used to train a shipped model can't be un-trained, which is why consent is scoped and expiring by default.",
  },
  {
    q: "Do I need a crypto wallet?",
    a: "No. Bank transfer and PayPal are the defaults, and most people never touch the crypto option. USDC exists because contributors in 41 countries can't all receive a US bank transfer. It's an on-ramp, not the point.",
  },
  {
    q: "How is this different from a data broker?",
    a: "A broker takes data you never knowingly gave and sells it without paying you. We invert all three: you choose what leaves, you see who buys it, and you take a cut of every sale. If that sounds like a worse business, it is. For the broker.",
  },
  {
    q: "For buyers: why not just scrape?",
    a: "Because you can't audit it, can't refresh it, can't commission what doesn't exist yet, and increasingly can't defend it. Datavar costs more per record than scraping and considerably less than discovery.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="bg-paper">
      <div className="mx-auto grid max-w-6xl gap-14 px-6 py-28 sm:py-36 lg:grid-cols-[0.8fr_1fr] lg:gap-20">
        <SectionHeading
          eyebrow="FAQ"
          title="The questions you should be asking."
          body="If something here reads like a dodge, tell us and we'll rewrite it."
        />

        <div className="space-y-px">
          {FAQS.map((faq, i) => (
            <Reveal key={faq.q} delay={i * 60}>
              <details className="group border-t border-rule">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[0.9375rem] font-medium text-ink transition-colors hover:text-slate [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span
                    aria-hidden="true"
                    className="relative h-3 w-3 shrink-0 text-ink-faint"
                  >
                    <span className="absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 bg-current" />
                    <span className="absolute top-0 left-1/2 h-3 w-px -translate-x-1/2 bg-current transition-transform duration-300 group-open:rotate-90 group-open:opacity-0" />
                  </span>
                </summary>
                <p className="pr-10 pb-6 text-sm text-pretty text-ink-dim">
                  {faq.a}
                </p>
              </details>
            </Reveal>
          ))}
          <div className="border-t border-rule" />
        </div>
      </div>
    </section>
  );
}
