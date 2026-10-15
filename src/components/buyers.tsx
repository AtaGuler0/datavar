import {
  CatalogueScreen,
  CheckoutScreen,
  DeliveryScreen,
  VerifyScreen,
} from "./market-screens";
import { NightHeading, PillLink } from "./night";
import { Reveal } from "./reveal";
import { ShowcaseScroll, type Showcase } from "./showcase-scroll";

/**
 * What a buyer gets today, each line something the testnet deployment does.
 * This list used to promise cohort commissioning, live streams and indemnity —
 * none of them built — beside an FAQ saying there was nothing to buy. The
 * catalogue shipped since; the promises didn't, so they went.
 */
const ITEMS: Showcase[] = [
  {
    tab: "Verify",
    title: "Provenance on every row",
    body: "Each dataset resolves to a consent receipt on Stellar: who agreed, for what purpose, and until when. Your legal team can check it against the ledger without asking us.",
    link: { label: "How consent receipts work", href: "/docs/consent-receipts" },
    screen: <VerifyScreen />,
  },
  {
    tab: "Catalogue",
    title: "Filter on what actually exists",
    body: "Narrow the catalogue by source, format, size, freshness, and how long the consent has left to run. There is no filter for data we don't hold.",
    link: { label: "Open the catalogue", href: "/market" },
    screen: <CatalogueScreen />,
  },
  {
    tab: "Checkout",
    title: "One signature for the basket",
    body: "Pay in USDC into the same contract contributors claim from. Every receipt is re-read on-chain before a licence is written, and no licence outlives its consent.",
    link: { label: "How licensing works", href: "/docs/licensing" },
    screen: <CheckoutScreen />,
  },
  {
    tab: "Delivery",
    title: "A withdrawal stops the next delivery",
    body: "Each download re-reads the receipt behind it. If the contributor has revoked, you get a refusal instead of a file, one ledger close later.",
    link: { label: "Your licences", href: "/market/licences" },
    screen: <DeliveryScreen />,
  },
];

export function Buyers() {
  return (
    <section id="buyers" className="border-t border-line bg-night">
      <div className="mx-auto max-w-6xl px-6 py-28 sm:py-36">
        <NightHeading
          size="lg"
          eyebrow="For AI teams"
          title="Scraped data is a lawsuit"
          aside="with a training loss."
          className="max-w-5xl"
        />
        <Reveal delay={120}>
          <p className="mt-8 max-w-xl text-[0.9375rem] leading-relaxed text-pretty text-star-dim">
            Every dataset in Datavar is traceable to a consenting person, a
            signed purpose, and an expiry date. Filter the catalogue, license
            with one signature, and check every receipt yourself. It all runs
            on Stellar testnet today.
          </p>
        </Reveal>

        <ShowcaseScroll
          items={ITEMS}
          action={<PillLink href="/market">Browse the catalogue</PillLink>}
        />

      </div>
    </section>
  );
}
