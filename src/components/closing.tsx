import Link from "next/link";
import { DashcamScene } from "./dashcam-scene";
import { Eyebrow, PillLink } from "./night";
import { Reveal } from "./reveal";

/** The last ask on the page, beside the view from a dashcam: the data
 *  someone is already making on the drive home. */
export function Closing() {
  return (
    <section className="border-t border-line bg-night">
      <div className="mx-auto grid max-w-6xl items-center gap-6 px-6 pt-24 sm:pt-32 lg:grid-cols-[1.1fr_1fr]">
        <div className="pb-4 lg:pb-24">
          <Reveal>
            <Eyebrow>Start</Eyebrow>
          </Reveal>
          <Reveal delay={60}>
            <h2 className="mt-6 text-[2.5rem] leading-[1.02] font-medium tracking-[-0.05em] text-balance text-star sm:text-[3.6rem]">
              You already make the data.{" "}
              <span className="text-star-faint">Start getting paid for it.</span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <PillLink href="/dashboard">Become a contributor</PillLink>
              <Link
                href="/docs"
                className="inline-flex h-11 items-center rounded-[14px] px-4 text-sm text-star-dim transition-colors duration-200 hover:text-star"
              >
                Read the docs
              </Link>
            </div>
          </Reveal>
        </div>
        <div className="mb-16 overflow-hidden rounded-xl border border-line bg-night-900/60 lg:mb-24">
          <DashcamScene className="block aspect-[16/10] w-full" />
        </div>
      </div>
    </section>
  );
}
