import type { Metadata } from "next";
import { Eyebrow, PillLink } from "@/components/night";
import { ProtocolView } from "@/components/protocol/protocol-view";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Protocol",
  description:
    "Every contribution on Datavar: how much data the protocol has taken in, from how many contributors, what has sold and what has been paid out. No wallet required to look.",
  alternates: { canonical: "/protocol" },
};

export default function ProtocolPage() {
  return (
    <div className="bg-night">
      <div className="mx-auto max-w-6xl px-6 pt-16 pb-28 sm:pt-24 sm:pb-36">
        <Reveal>
          <Eyebrow>Protocol</Eyebrow>
        </Reveal>
        <Reveal delay={60}>
          <h1 className="mt-6 -ml-[0.04em] max-w-5xl text-[2.75rem] leading-[1.02] font-medium tracking-[-0.05em] text-balance sm:text-6xl lg:text-[5rem]">
            {/* A sentence a line on a phone: run together, "public." ended
                up sharing a line with the second sentence. */}
            <span className="block text-star sm:inline">Counted in public.</span>{" "}
            <span className="block text-star-faint sm:inline">Read from the ledger.</span>
          </h1>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-8 max-w-md text-[1.0625rem] leading-relaxed text-pretty text-star-dim">
            No wallet, no account, no permission. Every figure below comes
            from the protocol&apos;s public views, and where nothing has
            happened it says zero.
          </p>
        </Reveal>

        <div className="mt-20">
          <ProtocolView />
        </div>

        <div className="mt-24 flex flex-wrap items-center justify-between gap-6 border-t border-line pt-10">
          <p className="text-[1.0625rem] text-star-dim">
            Your own numbers live in the contributor dashboard.
          </p>
          <PillLink href="/dashboard">Open the dashboard</PillLink>
        </div>
      </div>
    </div>
  );
}
