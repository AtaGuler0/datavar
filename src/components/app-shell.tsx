"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ADMIN_NAV, isAdminSectionActive } from "./admin/nav-config";
import { CONTRIBUTOR_NAV, isSectionActive } from "./dashboard/nav-config";
import { PixelMark } from "./logo";

/**
 * The application frame the contributor dashboard and the operator panel
 * share: the rail sits straight on the night ground, and the work happens in
 * one inset panel beside it — a rounded, hairline-bordered sheet a step
 * lighter than the ground, with a breadcrumb along its top. On a phone the
 * panel is the whole screen and the rail is a sheet behind the menu button.
 */

export type Side = "contributor" | "operator";

const SIDES = {
  contributor: {
    label: "Contributor",
    group: "Your account",
    nav: CONTRIBUTOR_NAV,
    active: isSectionActive,
  },
  operator: {
    label: "Operator",
    group: "Run the market",
    nav: ADMIN_NAV,
    active: isAdminSectionActive,
  },
} as const;

/** The outer frame: rail, then the inset panel holding everything else. */
export function AppShell({
  rail,
  side,
  children,
}: {
  rail: ReactNode;
  side: Side;
  children: ReactNode;
}) {
  return (
    // Viewport-sized, and only the panel's body scrolls — the page itself never
    // moves, so whatever the wallet kit appends after us can't add stray
    // scroll height or shove the rail off-screen.
    <div className="flex h-dvh bg-night md:p-2 md:pl-0">
      {rail}
      <div className="app-panel flex min-w-0 flex-1 flex-col overflow-hidden bg-night-900 md:rounded-xl md:border md:border-line">
        <PanelHeader side={side} />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

/** The panel's top edge: where you are, and which network it is. */
function PanelHeader({ side }: { side: Side }) {
  const pathname = usePathname();
  const { label, nav, active } = SIDES[side];
  const current = nav.find((section) => active(section.href, pathname));

  return (
    <header className="hidden h-12 shrink-0 items-center justify-between gap-4 border-b border-line px-5 md:flex">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        <span className="text-star-faint">{label}</span>
        <span aria-hidden="true" className="text-star-ghost">
          /
        </span>
        <span className="truncate text-star">{current?.label ?? "Overview"}</span>
      </nav>
      <span className="shrink-0 font-mono text-[0.6875rem] tracking-[0.08em] text-star-faint uppercase">
        Stellar testnet
      </span>
    </header>
  );
}

/** Top of the rail: the mark, the name, and which side of the product this is. */
export function RailWorkspace({ side }: { side: Side }) {
  return (
    <Link
      href="/"
      aria-label="Datavar home"
      className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-night-800"
    >
      <PixelMark className="h-6 w-6 shrink-0" />
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-medium text-star">Datavar</span>
        <span className="block text-xs text-star-faint">
          {SIDES[side].label}
        </span>
      </span>
    </Link>
  );
}

/** A group heading in the rail: quiet, sentence case, like a folder name. */
export function RailGroup({ side, children }: { side: Side; children: ReactNode }) {
  return (
    <div>
      <p className="px-3 text-[0.8125rem] text-star-faint">{SIDES[side].group}</p>
      <ul className="mt-1.5 flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

/** Classes for a rail link and its icon. The current page is a filled pill. */
export function railItem(active: boolean) {
  return {
    link: `group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
      active
        ? "bg-night-700 text-star"
        : "text-star-dim hover:bg-night-800 hover:text-star"
    }`,
    icon: active
      ? "text-star"
      : "text-star-faint transition-colors group-hover:text-star-dim",
  };
}
