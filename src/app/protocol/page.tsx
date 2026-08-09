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
      <div className="mx-auto max-w-6xl px-6 pt-24 pb-12 sm:pt-32">
        {/* The marketing heading grammar, as an h1 — this is the page's own
            subject rather than a section of a longer one. */}
        <div className="max-w-2xl">
          <Reveal>
            <p className="eyebrow text-ink-faint">Protocol</p>
          </Reveal>
          <Reveal delay={60}>
            <h1 className="display mt-4 text-[2rem] font-medium text-balance text-ink sm:text-[2.75rem]">
              Everything contributed, counted in public.
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-5 text-base text-pretty text-ink-dim sm:text-lg">
              These are the protocol&apos;s own numbers, counted from real
              contributions rather than typed in. No wallet, no account, no
              permission — if the protocol has done nothing, the page says zero.
            </p>
          </Reveal>
        </div>
      </div>

      {/* Sunken, so the raised cards read as raised — the same depth cue the
          dashboard gets from its shell. */}
      <div className="border-t border-rule bg-paper-sunken/40">
        <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
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
