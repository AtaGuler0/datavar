import type { Metadata } from "next";
import Link from "next/link";
import { NetworkPanel } from "@/components/dashboard/network-panel";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Protocol",
  description:
    "Every contribution on Datavar: how much data the protocol has taken in, from how many contributors, and how it has grown. No wallet required to look.",
  alternates: { canonical: "/protocol" },
};

export default function ProtocolPage() {
  return (
    <>
      {/* Kept deliberately short: the numbers below are the page, so the
          heading gets a line to say so and then gets out of the way. */}
      <div className="mx-auto max-w-6xl px-6 pt-10 pb-8 sm:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div className="max-w-xl">
            <Reveal>
              <p className="eyebrow text-ink-faint">Protocol</p>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="display mt-3 text-[1.75rem] font-medium text-balance text-ink sm:text-[2.25rem]">
                Everything contributed, counted in public.
              </h1>
            </Reveal>
          </div>
          <Reveal delay={120}>
            <p className="max-w-sm text-pretty text-sm text-ink-dim">
              Counted from the ledger rather than typed in. No wallet, no
              account, no permission — if the protocol has done nothing, the
              page says zero.
            </p>
          </Reveal>
        </div>
      </div>

      {/* Sunken, so the raised cards read as raised — the same depth cue the
          dashboard gets from its shell. */}
      <div className="border-t border-rule bg-paper-sunken/40">
        <div className="mx-auto max-w-6xl px-6 py-8 sm:py-10">
          <NetworkPanel />

          <p className="mt-8 text-sm text-ink-dim">
            Your own account lives in the{" "}
            <Link
              href="/dashboard"
              className="text-ink underline decoration-rule-strong underline-offset-2 transition-colors hover:decoration-ink"
            >
              contributor dashboard
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
