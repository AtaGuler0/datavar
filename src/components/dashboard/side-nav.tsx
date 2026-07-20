"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "../logo";
import { truncateAddress } from "@/lib/stellar/config";
import { CONTRIBUTOR_NAV, isSectionActive } from "./nav-config";
import { useWallet } from "./wallet-provider";

/**
 * Line icons for the rail, one per section. Same 16-grid and 1.5 stroke as
 * every other glyph in the product so the rail doesn't read as a third-party
 * icon set.
 */
function SectionIcon({ href, className }: { href: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    "/dashboard": (
      <>
        <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
        <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
        <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
        <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
      </>
    ),
    "/dashboard/sources": (
      <>
        <ellipse cx="8" cy="4" rx="5" ry="2" />
        <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4" />
        <path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
      </>
    ),
    "/dashboard/uploads": (
      <>
        <path d="M8 10V3.5M5 6l3-2.5L11 6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 10.5v1.5a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5v-1.5" strokeLinecap="round" />
      </>
    ),
    "/dashboard/consent": (
      <>
        <path d="M8 2l4.5 1.8V8c0 2.7-1.9 4.4-4.5 5.5C5.4 12.4 3.5 10.7 3.5 8V3.8L8 2z" strokeLinejoin="round" />
        <path d="M6.2 8l1.3 1.3L10 6.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    "/dashboard/earnings": (
      <>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 4.9v.9M8 10.2v.9M9.6 6.7c-.3-.5-.9-.9-1.6-.9-.9 0-1.6.5-1.6 1.1 0 1.5 3.2.8 3.2 2.3 0 .6-.7 1.1-1.6 1.1-.7 0-1.3-.3-1.6-.8" strokeLinecap="round" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-4 w-4 shrink-0 ${className ?? ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {paths[href]}
    </svg>
  );
}

/**
 * The wallet as the account block at the foot of the rail — where a SaaS
 * dashboard puts its user avatar. Connected → address plus a leave button;
 * disconnected → the connect action itself.
 */
function SidebarWallet() {
  const { address, status, connect, disconnect } = useWallet();

  if (status === "loading") {
    return <div className="h-11 animate-pulse rounded-xl bg-paper-sunken" />;
  }

  if (!address) {
    return (
      <button
        type="button"
        onClick={connect}
        disabled={status === "connecting"}
        className="inline-flex w-full items-center justify-center rounded-xl bg-slate-deep px-4 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate disabled:opacity-70"
      >
        {status === "connecting" ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-rule bg-paper px-3 py-2.5">
      <span className="truncate font-mono text-xs tabular-nums text-ink">
        {truncateAddress(address)}
      </span>
      <button
        type="button"
        onClick={disconnect}
        aria-label="Disconnect wallet"
        title="Disconnect"
        className="text-ink-faint transition-colors hover:text-ink"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M10 5.5V4a1.5 1.5 0 00-1.5-1.5h-4A1.5 1.5 0 003 4v8a1.5 1.5 0 001.5 1.5h4A1.5 1.5 0 0010 12v-1.5" strokeLinecap="round" />
          <path d="M6.5 8H14M11.5 5.5L14 8l-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

/**
 * The desktop rail: logo up top, icon nav in the middle, testnet notice and
 * the wallet block at the foot. The active section is the enterprise block
 * in miniature — ink-950 pill, chalk text.
 */
export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-rule bg-paper md:flex">
      <div className="px-6 pt-6">
        <Link href="/" aria-label="Datavar home">
          <Logo />
        </Link>
      </div>

      <p className="mt-8 px-6 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
        Contributor
      </p>
      <ul className="mt-2 flex flex-col gap-0.5 px-3">
        {CONTRIBUTOR_NAV.map((section) => {
          const active = isSectionActive(section.href, pathname);
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-ink-950 text-chalk"
                    : "text-ink-dim hover:bg-paper-sunken/60 hover:text-ink"
                }`}
              >
                <SectionIcon
                  href={section.href}
                  className={
                    active
                      ? "text-chalk-dim"
                      : "text-ink-faint transition-colors group-hover:text-ink-dim"
                  }
                />
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-2.5 px-3 pb-5">
        <div className="rounded-xl border border-rule bg-paper-raised/70 p-3.5">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
            Stellar testnet
          </p>
          <p className="mt-1.5 text-xs text-pretty text-ink-dim">
            No real funds move yet. Payouts settle in test XLM.
          </p>
        </div>
        <SidebarWallet />
      </div>
    </aside>
  );
}

/**
 * The same links as a horizontal strip for small screens, rendered inside the
 * mobile top bar. Active treatment matches the rail's pill.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="border-t border-rule">
      <ul className="flex gap-1 overflow-x-auto px-4 py-2.5">
        {CONTRIBUTOR_NAV.map((section) => {
          const active = isSectionActive(section.href, pathname);
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-ink-950 font-medium text-chalk"
                    : "text-ink-dim hover:text-ink"
                }`}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
