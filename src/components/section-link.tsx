"use client";

import type { ReactNode } from "react";

/**
 * An in-page link that goes where it says without writing a fragment into the
 * address bar.
 *
 * The `href` stays real on purpose. It is what a middle-click, a
 * modifier-click and a page with no JavaScript all follow, and it is what a
 * screen reader announces — a button with a scroll handler would be none of
 * those things. The handler only takes over the plain left-click, which is the
 * one case where `datavar.xyz/#how` is noise: the reader is already on the
 * page, and the URL they might copy afterwards now says something they didn't
 * choose.
 *
 * `scrollIntoView` is used rather than a manual offset because it honours the
 * `scroll-margin-top` on `section[id]` in globals.css, so the heading clears
 * the fixed header exactly as it does for a real anchor jump.
 */
export function SectionLink({
  href,
  className,
  onNavigate,
  children,
}: {
  /** A same-page fragment, e.g. "#how". */
  href: string;
  className?: string;
  /** Runs on every click — used by the mobile sheet to close itself. */
  onNavigate?: () => void;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        onNavigate?.();
        // Let the browser handle "open in a new tab" and friends; a fragment
        // is the only way that click can land anywhere useful.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        const target = document.querySelector(href);
        // No such section: fall through to the browser rather than swallowing
        // the click and doing nothing.
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}
