"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CONTRIBUTOR_NAV, isSectionActive } from "./nav-config";

/**
 * Section navigation. A vertical rail on desktop, a horizontal scroll strip
 * on mobile — same links, same active treatment (a slate marker plus the
 * mono index going full-strength).
 */
export function SideNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop rail */}
      <nav className="hidden w-52 shrink-0 border-r border-rule md:block">
        <ul className="sticky top-16 flex flex-col gap-0.5 py-8 pr-4">
          {CONTRIBUTOR_NAV.map((section) => {
            const active = isSectionActive(section.href, pathname);
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-paper-raised text-ink"
                      : "text-ink-dim hover:bg-paper-raised hover:text-ink"
                  }`}
                >
                  <span
                    className={`font-mono text-[0.625rem] tabular-nums ${
                      active ? "text-slate" : "text-ink-faint"
                    }`}
                  >
                    {section.index}
                  </span>
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile strip */}
      <nav className="border-b border-rule md:hidden">
        <ul className="flex gap-1 overflow-x-auto px-4 py-3">
          {CONTRIBUTOR_NAV.map((section) => {
            const active = isSectionActive(section.href, pathname);
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-paper-raised text-ink"
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
    </>
  );
}
