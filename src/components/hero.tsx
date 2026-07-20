import Link from "next/link";
import { CrowdField } from "./crowd-field";

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden bg-paper pt-16"
    >
      <CrowdField className="absolute inset-x-0 bottom-0 -z-10 h-[72%] w-full" />

      {/* Lifts the crowd out of the headline's way without hiding it. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[68%] bg-gradient-to-b from-paper via-paper/92 to-transparent"
      />

      <div className="mx-auto w-full max-w-4xl px-6 text-center">
        <a
          href="#how"
          className="group inline-flex items-center gap-2 rounded-full border border-rule bg-paper/70 px-3.5 py-1.5 text-xs text-ink-dim backdrop-blur-sm transition-colors hover:border-rule-strong hover:text-ink"
        >
          <span className="h-1 w-1 rounded-full bg-slate" />
          Every record carries a signed consent receipt
          <svg
            viewBox="0 0 16 16"
            className="h-3 w-3 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M6 3l5 5-5 5" strokeLinecap="round" />
          </svg>
        </a>

        <h1 className="display mt-7 text-[2.625rem] font-medium text-balance text-ink sm:text-6xl lg:text-[4.5rem]">
          Your data is already training AI.
          <br className="hidden sm:block" />{" "}
          <span className="text-ink-faint">Get paid for it.</span>
        </h1>

        <p className="mx-auto mt-7 max-w-xl text-base text-pretty text-ink-dim sm:text-lg">
          Datavar turns the data you already produce into a monthly payout, and
          gives AI teams the one thing scraped data can never have: consent.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex w-full items-center justify-center rounded-lg bg-slate-deep px-6 py-3 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate sm:w-auto"
          >
            Become a contributor
          </Link>
          <a
            href="#buyers"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rule bg-paper-raised px-6 py-3 text-sm font-medium text-ink transition-colors duration-200 hover:bg-paper-sunken sm:w-auto"
          >
            License datasets
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M6 3l5 5-5 5" strokeLinecap="round" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
