import type { ReactNode } from "react";
import { CONTACT } from "@/lib/contact";
import { Arrow } from "./night";
import { Reveal } from "./reveal";

const contactLink =
  "text-star underline decoration-star-ghost underline-offset-4 transition-colors hover:decoration-star";

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "Are you selling my identity?",
    a: "We never asked for it: there is no signup form and no name, just the Stellar wallet address you connect. If you link a Google account to sign in faster, we keep its email for that and nothing else. What sits inside a file is yours to check before you send it, because we do not read it and we do not scrub it either.",
  },
  {
    q: "How much will I actually earn?",
    a: "Nothing yet, because nobody has bought anything. The sales you see come from a simulated buyer we run ourselves and settle in test USDC, so any figure we quoted today would be one we invented.",
  },
  {
    q: "What happens if I change my mind?",
    a: "Revoking signs a transaction that marks the receipt withdrawn on Stellar, and after that anyone can ask the contract and be told no without coming through us. It cannot reach into a model that already trained on the data, which is why the contract refuses any consent without an end date in the future.",
  },
  {
    q: "Do I need a crypto wallet?",
    a: "For now, yes: your wallet is your account, and payouts settle in USDC on Stellar, where a payment costs a fraction of a cent and a fifty cent payout is still worth sending.",
  },
  {
    q: "How is this different from a data broker?",
    a: "A broker sells data you never knowingly handed over and keeps the money; here you choose what leaves, you see who licensed it, and you take a cut. All three are built and running on testnet. What is missing is real buyers, which is why the sales so far are simulated.",
  },
  {
    q: "For AI teams: why not just scrape?",
    // The one answer that ends in an ask, so it carries the way to answer it.
    a: (
      <>
        Scraped data has no answer to who agreed to it, while ours carries a
        receipt you can check against the ledger yourself, including whether it
        was withdrawn last week. The catalogue, checkout and delivery run on
        testnet today, and every download re-reads the receipt. A cohort
        builder and a streaming API do not exist yet, so if you want those,
        tell us what you would actually pay for: on Telegram at{" "}
        <a href={CONTACT.telegram.href} target="_blank" rel="noreferrer" className={contactLink}>
          {CONTACT.telegram.handle}
        </a>
        , or at{" "}
        <a href={CONTACT.email.href} className={contactLink}>
          {CONTACT.email.address}
        </a>
        .
      </>
    ),
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t border-line bg-night">
      <div className="mx-auto grid max-w-6xl gap-14 px-6 py-28 sm:py-36 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
        <Reveal>
          <div className="lg:sticky lg:top-36">
            <p className="font-mono text-[0.75rem] tracking-[0.1em] text-star-faint uppercase">
              FAQ
            </p>
            <h2 className="mt-4 text-[2rem] leading-[1.1] font-medium tracking-[-0.035em] text-balance text-star sm:text-[2.25rem]">
              The questions you should be asking.
            </h2>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-pretty text-star-dim">
              If one of these reads like a dodge, tell us and we&apos;ll rewrite
              it.
            </p>
            <a
              href={CONTACT.telegram.href}
              target="_blank"
              rel="noreferrer"
              className="group mt-4 inline-flex items-center gap-2 py-2 text-sm text-star transition-colors hover:text-white"
            >
              Ask us on Telegram
              <Arrow className="h-3 w-3 text-star-dim transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>
        </Reveal>

        <div className="faq border-b border-line">
          {FAQS.map((faq, i) => (
            <Reveal key={faq.q} delay={i * 50}>
              {/* A shared name makes these an exclusive group: opening one
                  closes whichever was open. The browser does it, so there is
                  no state to hold and no reason to make this a client
                  component. Browsers without it fall back to letting several
                  stand open, which is the old behaviour and not a broken one. */}
              <details name="faq" className="group border-t border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[1.0625rem] font-medium tracking-[-0.01em] text-star transition-colors hover:text-white [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  {/* A plus that loses its upright and becomes a minus. */}
                  <span aria-hidden="true" className="relative h-3 w-3 shrink-0 text-star-dim">
                    <span className="absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 bg-current" />
                    <span className="absolute top-0 left-1/2 h-3 w-px -translate-x-1/2 bg-current transition-transform duration-300 group-open:scale-y-0" />
                  </span>
                </summary>
                <p className="max-w-2xl pr-10 pb-7 text-[0.9375rem] leading-relaxed text-pretty text-star-dim">
                  {faq.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
