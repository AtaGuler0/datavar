import Link from "next/link";
import { ConnectPanel } from "@/components/dashboard/connect-panel";
import { CONTRIBUTOR_NAV } from "@/components/dashboard/nav-config";
import { PageHeading } from "@/components/dashboard/primitives";

const SECTIONS = CONTRIBUTOR_NAV.filter((s) => s.href !== "/dashboard");

export default function DashboardOverview() {
  return (
    <div>
      <PageHeading
        eyebrow="Overview"
        title="Your contributor account."
        description="Everything here is keyed to your Stellar wallet — no email, no password. Connect one to load your sources, consent receipts and payouts."
      />

      <div className="mt-10">
        <ConnectPanel />
      </div>

      {/* Section index — the shell is navigable before any of it is wired. */}
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group flex items-start gap-4 rounded-xl border border-rule bg-paper-raised p-5 transition-colors hover:border-rule-strong hover:bg-paper-sunken"
          >
            <span className="mt-0.5 font-mono text-xs tabular-nums text-ink-faint">
              {section.index}
            </span>
            <span className="flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                {section.label}
                <svg
                  viewBox="0 0 16 16"
                  className="h-3 w-3 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M6 3l5 5-5 5" strokeLinecap="round" />
                </svg>
              </span>
              <span className="mt-1 block text-sm text-pretty text-ink-dim">
                {section.summary}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
