import { Buyers } from "@/components/buyers";
import { ContributorDemo } from "@/components/contributor-demo";
import { Reveal } from "@/components/reveal";
import { Closing } from "@/components/closing";
import { Earnings } from "@/components/earnings";
import { Faq } from "@/components/faq";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Marquee } from "@/components/marquee";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { EMPTY_STATS, loadProtocolStats } from "@/lib/supabase/stats";

/**
 * The earnings estimate is built from live testnet sale averages, so the page
 * can't be baked at build time and left there. Five minutes is long enough that a visitor spike costs
 * one query, short enough that a contributor who just uploaded sees themselves
 * counted.
 */
export const revalidate = 300;

export default async function Home() {
  // A landing page that 500s because the data plane blinked would be a poor
  // trade for an estimate. Fall back to zeros — never to invented ones.
  const stats = await loadProtocolStats().catch(() => EMPTY_STATS);

  return (
    <div className="flex flex-1 flex-col">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        {/* The product, playable, straight under the hero: the first thing
            past the fold is the loop itself. The live counts are on
            /protocol. */}
        <section className="bg-night">
          <div className="mx-auto max-w-6xl px-6">
            <Reveal>
              <ContributorDemo />
            </Reveal>
          </div>
        </section>
        <Marquee />
        <HowItWorks />
        <Earnings avgStroopsBySource={stats.avgStroopsBySource} />
        <Buyers />
        <Faq />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  );
}
