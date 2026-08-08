import { Buyers } from "@/components/buyers";
import { Earnings } from "@/components/earnings";
import { Faq } from "@/components/faq";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Marquee } from "@/components/marquee";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { Stats } from "@/components/stats";
import { EMPTY_STATS, loadProtocolStats } from "@/lib/supabase/stats";

/**
 * The landing page quotes live protocol numbers, so it can't be baked at build
 * time and left there. Five minutes is long enough that a visitor spike costs
 * one query, short enough that a contributor who just uploaded sees themselves
 * counted.
 */
export const revalidate = 300;

export default async function Home() {
  // A landing page that 500s because the data plane blinked would be a poor
  // trade for four numbers. Fall back to zeros — never to invented ones.
  const stats = await loadProtocolStats().catch(() => EMPTY_STATS);

  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <Marquee />
        <HowItWorks />
        <Earnings avgStroopsBySource={stats.avgStroopsBySource} />
        <Buyers />
        <Stats stats={stats} />
        <Faq />
      </main>
      <SiteFooter />
    </>
  );
}
