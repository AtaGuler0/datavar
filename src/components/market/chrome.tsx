"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { WalletButton } from "@/components/dashboard/wallet-button";
import { Logo } from "@/components/logo";

/**
 * The marketplace's own header.
 *
 * Neither of the two shells this product already had fits the buy side. The
 * marketing header is for a stranger being persuaded; the dashboard rail is a
 * contributor's workspace, and its sections are about their own data. A buyer
 * is signed in like the second and browsing like the first, so this is a thin
 * bar over a full-width page: the catalogue needs the horizontal room, and
 * there are only a few places to be.
 */
const LINKS = [
  { href: "/market", label: "Catalogue" },
  { href: "/market/licences", label: "Your licences" },
  { href: "/market/profile", label: "Profile" },
];

export function MarketChrome() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-night/85 backdrop-blur-xl">
      {/* On a phone the three links don't fit beside the logo and the
          wallet, and the last one used to vanish off the edge. Below sm they
          take a second row of their own, which scrolls if it ever has to. */}
      <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-x-5 px-4 sm:h-16 sm:flex-nowrap sm:px-6">
        <Link
          href="/"
          aria-label="Datavar home"
          className="flex h-14 shrink-0 items-center sm:h-auto"
        >
          <Logo />
        </Link>
        <span aria-hidden="true" className="hidden h-5 w-px bg-line-strong sm:block" />
        <span className="hidden font-mono text-[0.75rem] tracking-[0.12em] text-star-faint uppercase sm:inline">
          Marketplace
        </span>

        <nav className="order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-6 overflow-x-auto px-4 pb-3 sm:order-none sm:mx-0 sm:ml-6 sm:w-auto sm:min-w-0 sm:overflow-visible sm:px-0 sm:pb-0">
          {LINKS.map((link) => {
            const active =
              link.href === "/market"
                ? pathname === "/market"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative py-1 text-sm whitespace-nowrap transition-colors ${
                  active ? "text-star" : "text-star-dim hover:text-star"
                }`}
              >
                {link.label}
                {/* The current page underlined, the way a drawing's active
                    sheet is: a hairline, not a filled tab. */}
                {active && (
                  <span aria-hidden="true" className="absolute inset-x-0 -bottom-[1.1rem] hidden h-px bg-star sm:block" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <Link
            href="/dashboard"
            className="hidden text-sm text-star-dim transition-colors hover:text-star sm:inline"
          >
            Contribute data
          </Link>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

/**
 * The frame every market page past the catalogue sits in: one reading
 * measure, centred, so the licences and the profile are the same width as
 * each other rather than whatever each happened to pick.
 */
export function MarketPage({
  section,
  title,
  aside,
  description,
  children,
}: {
  section: string;
  title: string;
  aside?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[110rem] px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <div className="mx-auto max-w-5xl">
        <header>
          <p className="font-mono text-[0.75rem] tracking-[0.12em] text-star-faint uppercase">
            Datavar <span className="mx-2 text-star-ghost">│</span> {section}
          </p>
          <h1 className="mt-6 -ml-[0.04em] text-[2.5rem] leading-[1.02] font-medium tracking-[-0.05em] text-balance sm:text-[3.25rem]">
            <span className="text-star">{title}</span>
            {aside && (
              <>
                {" "}
                <span className="text-star-faint">{aside}</span>
              </>
            )}
          </h1>
          {description && (
            <p className="mt-5 max-w-xl text-[0.9375rem] leading-relaxed text-pretty text-star-dim">
              {description}
            </p>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
