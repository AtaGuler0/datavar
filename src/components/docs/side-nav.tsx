"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOC_GROUPS, docHref, findDoc } from "@/lib/docs";

/**
 * The docs rail. Deliberately the same grammar as the dashboard's: mono
 * uppercase group labels, rounded items, and the enterprise block in
 * miniature for the current page. A docs site that invented its own nav
 * language would read as a third-party tool bolted on.
 */

function isCurrent(slug: string, pathname: string): boolean {
  return pathname === docHref(slug);
}

export function DocsSideNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: a sticky rail that scrolls with the page under the fixed
          header, like the dashboard's but inside the marketing shell. */}
      <nav className="hidden md:sticky md:top-16 md:block md:max-h-[calc(100dvh-4rem)] md:self-start md:overflow-y-auto md:py-16">
        <div className="space-y-8">
          {DOC_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-3 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                {group.title}
              </p>
              <ul className="mt-2 flex flex-col gap-0.5">
                {group.pages.map((page) => {
                  const active = isCurrent(page.slug, pathname);
                  return (
                    <li key={page.slug}>
                      <Link
                        href={docHref(page.slug)}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                          active
                            ? "bg-ink-950 font-medium text-chalk"
                            : "text-ink-dim hover:bg-paper-sunken/60 hover:text-ink"
                        }`}
                      >
                        {page.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Mobile: the whole index behind a disclosure, closed by default. Native
          details, the same primitive the FAQ uses — no state, no client work
          beyond the pathname. */}
      <details className="group border-b border-rule md:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
          {findDoc(pathname.replace(/^\/docs\/?/, ""))?.title ?? "Documentation"}
          {/* Plus closed, minus open — the FAQ's glyph, same behaviour. */}
          <span aria-hidden="true" className="relative h-3 w-3 shrink-0 text-ink-faint">
            <span className="absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 bg-current" />
            <span className="absolute top-0 left-1/2 h-3 w-px -translate-x-1/2 bg-current transition-transform duration-300 group-open:rotate-90 group-open:opacity-0" />
          </span>
        </summary>

        <div className="space-y-6 pb-6">
          {DOC_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                {group.title}
              </p>
              <ul className="mt-2 flex flex-col gap-0.5">
                {group.pages.map((page) => {
                  const active = isCurrent(page.slug, pathname);
                  return (
                    <li key={page.slug}>
                      <Link
                        href={docHref(page.slug)}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                          active
                            ? "bg-ink-950 font-medium text-chalk"
                            : "text-ink-dim hover:text-ink"
                        }`}
                      >
                        {page.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </>
  );
}
