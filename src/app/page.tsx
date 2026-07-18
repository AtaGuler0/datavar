import { Buyers } from "@/components/buyers";
import { Earnings } from "@/components/earnings";
import { Faq } from "@/components/faq";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Marquee } from "@/components/marquee";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { Stats } from "@/components/stats";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <Marquee />
        <HowItWorks />
        <Earnings />
        <Buyers />
        <Stats />
        <Faq />
      </main>
      <SiteFooter />
    </>
  );
}
