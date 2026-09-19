"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  // The ramp sits in this bar rather than in the dashboard because both sides
  // need it: a buyer with lira and no USDC, and a contributor with USDC and
  // bills in lira.
  { href: "/anchor", label: "TRY ramp" },
];

export function MarketChrome() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[110rem] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Datavar home" className="shrink-0">
          <Logo />
        </Link>

        <nav className="flex min-w-0 items-center gap-1">
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
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-paper-sunken/70 text-ink"
                    : "text-ink-dim hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/dashboard"
            className="hidden text-sm text-ink-dim transition-colors hover:text-ink sm:inline"
          >
            Contribute data
          </Link>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
