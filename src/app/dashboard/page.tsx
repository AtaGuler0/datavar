import Link from "next/link";
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

      {/* The enterprise block, borrowed from the landing page: a dark panel
          that states the one thing standing between you and your data. */}
      <div className="mt-10 overflow-hidden rounded-2xl border border-ink-800 bg-ink-950">
        <div className="flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
          <div className="max-w-md">
            <p className="eyebrow text-chalk-faint">Not connected</p>
            <p className="mt-3 text-lg text-balance text-chalk">
              Connect a Stellar wallet to sign in.
            </p>
            <p className="mt-2 text-sm text-pretty text-chalk-dim">
              Your wallet is your identity and where payouts land. We&apos;re on
              testnet — no real funds move yet.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-chalk px-5 py-3 text-sm font-medium text-ink-950 transition-colors hover:bg-paper disabled:cursor-not-allowed"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-slate" />
            Connect wallet
          </button>
        </div>
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
