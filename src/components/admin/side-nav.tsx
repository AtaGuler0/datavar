"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "../logo";
import { SidebarWallet } from "../dashboard/side-nav";
import { ADMIN_NAV, isAdminSectionActive } from "./nav-config";

/**
 * Rail icons for the operator side. Same 16-grid and 1.5 stroke as the
 * contributor rail — this is the same building, seen from the back office.
 */
function SectionIcon({ href, className }: { href: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    "/admin": (
      <>
        <path d="M2.5 13.5V9M6.5 13.5V5.5M10.5 13.5v-6M14 13.5V3" strokeLinecap="round" />
      </>
    ),
    "/admin/datasets": (
      <>
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
        <path d="M2.5 6h11M6.5 6v7.5" />
      </>
    ),
    "/admin/sales": (
      <>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 4.9v.9M8 10.2v.9M9.6 6.7c-.3-.5-.9-.9-1.6-.9-.9 0-1.6.5-1.6 1.1 0 1.5 3.2.8 3.2 2.3 0 .6-.7 1.1-1.6 1.1-.7 0-1.3-.3-1.6-.8" strokeLinecap="round" />
      </>
    ),
    "/admin/blog": (
      <>
        <path d="M3 2.5h6.5L13 6v7.5H3z" strokeLinejoin="round" />
        <path d="M9.5 2.5V6H13M5.5 8.5h5M5.5 11h3.5" strokeLinecap="round" />
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
 * The operator rail. Identical furniture to the contributor one, with the
 * label and the way out of it changed — you should never be in any doubt
 * about which side of the product you're looking at.
 */
export function AdminSideNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-rule bg-paper md:flex">
      <div className="px-6 pt-6">
        <Link href="/" aria-label="Datavar home">
          <Logo />
        </Link>
      </div>

      <p className="mt-8 px-6 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
        Operator
      </p>
      <ul className="mt-2 flex flex-col gap-0.5 px-3">
        {ADMIN_NAV.map((section) => {
          const active = isAdminSectionActive(section.href, pathname);
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
        <Link
          href="/dashboard"
          className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-dim transition-colors hover:text-ink"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-ink-dim"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Contributor view
        </Link>
        <SidebarWallet />
      </div>
    </aside>
  );
}

/** The same links as a strip for small screens, inside the admin top bar. */
export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="border-t border-rule">
      <ul className="flex gap-1 overflow-x-auto px-4 py-2.5">
        {ADMIN_NAV.map((section) => {
          const active = isAdminSectionActive(section.href, pathname);
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
