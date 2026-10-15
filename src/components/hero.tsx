import Link from "next/link";
import { BridgeScene } from "./bridge-scene";
import { PixelMark } from "./logo";
import { PillLink } from "./night";

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate flex min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-night pt-28 pb-40 sm:pb-24"
    >
      {/* Was <Constellation />, the two figures flanking the copy; the
          bridge is on trial. Swap back here to undo. */}
      <BridgeScene className="absolute inset-0 -z-10 h-full w-full" />

      <div className="mx-auto w-full max-w-4xl px-6 text-center">
        <PixelMark className="mx-auto h-7 w-7" />

        <h1 className="display-night mt-8 text-[2.75rem] text-balance text-star sm:text-6xl lg:text-[4.75rem]">
          {/* One sentence a line: the claim, then the turn. Run together on
              a phone, the break landed after "trains" and left "AI." on the
              second line with the turn. */}
          <span className="block">Your data trains AI.</span>{" "}
          <span className="block text-star-faint">Get paid for it.</span>
        </h1>

        <p className="mx-auto mt-7 max-w-lg text-base tracking-[-0.015em] text-pretty text-star-dim">
          Datavar pays you each time the data you already produce is licensed,
          and gives AI teams the one thing scraped data can never have: consent.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PillLink href="/dashboard">Become a contributor</PillLink>
          <Link
            href="/market"
            className="inline-flex h-11 items-center rounded-[14px] px-4 text-sm text-star-dim transition-colors duration-200 hover:text-star"
          >
            License datasets
          </Link>
        </div>
      </div>
    </section>
  );
}
