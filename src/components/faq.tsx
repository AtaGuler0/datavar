import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const FAQS = [
  {
    q: "Are you selling my identity?",
    a: "We never asked for it: there is no signup, no email and no name, just the Stellar wallet address you connect. What sits inside a file is yours to check before you send it, because we do not read it and we do not scrub it either.",
  },
  {
    q: "How much will I actually earn?",
    a: "Nothing yet, because nobody has bought anything. The sales you see come from a simulated buyer we run ourselves and settle in test XLM, so any figure we quoted today would be one we invented.",
  },
  {
    q: "What happens if I change my mind?",
    a: "Revoking signs a transaction that marks the receipt withdrawn on Stellar, and after that anyone can ask the contract and be told no without coming through us. It cannot reach into a model that already trained on the data, which is why the contract refuses any consent without an end date in the future.",
  },
  {
    q: "Do I need a crypto wallet?",
    a: "For now, yes: your wallet is your account, and payouts settle in XLM on Stellar, where a payment costs a fraction of a cent and a fifty cent payout is still worth sending. PayPal is planned but not live.",
  },
  {
    q: "How is this different from a data broker?",
    a: "A broker sells data you never knowingly handed over and keeps the money; here you choose what leaves, you see who licensed it, and you take a cut. Only the first of those is built so far, because the other two need buyers we do not have yet.",
  },
  {
    q: "For AI teams: why not just scrape?",
    a: "Scraped data has no answer to who agreed to it, while ours carries a receipt you can check against the ledger yourself, including whether it was withdrawn last week. That runs on testnet today with no catalogue or delivery yet, so if you want those sooner, tell us what you would actually pay for.",
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
              {/* A shared name makes these an exclusive group: opening one
                  closes whichever was open. The browser does it, so there is
                  no state to hold and no reason to make this a client
                  component. Browsers without it fall back to letting several
                  stand open, which is the old behaviour and not a broken one. */}
              <details name="faq" className="group border-t border-rule">
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
