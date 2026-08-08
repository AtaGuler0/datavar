import Link from "next/link";
import { Logo } from "./logo";
import { DOC_GROUPS, docHref } from "@/lib/docs";

/**
 * Four columns of plans used to stand here — Careers, Pricing, DPA and the
 * rest — none of them links, because none of those pages existed. Showing the
 * shape of a company we aren't yet was the wrong trade: a reader can't tell a
 * roadmap from a lie by looking at it.
 *
 * What replaced them is the documentation, which covers most of what those
 * headings promised and, unlike them, exists. The columns are built from the
 * docs index itself, so a page added there appears here without anyone
 * remembering to.
 */

/** The docs groups worth surfacing in a footer, in order. */
const FOOTER_GROUPS = ["Getting started", "Contributing", "For AI teams"];

const COLUMNS = FOOTER_GROUPS.map((title) => {
  const group = DOC_GROUPS.find((g) => g.title === title);
  return {
    title,
    links:
      group?.pages.map((page) => ({
        label: page.title,
        href: docHref(page.slug),
      })) ?? [],
  };
});

/** The rest of the site, for a reader who came here looking for the exits. */
const ELSEWHERE = [
  { label: "All documentation", href: "/docs" },
  { label: "Blog", href: "/blog" },
  { label: "Become a contributor", href: "/dashboard" },
  { label: "For AI teams", href: "/docs/licensing" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-paper-raised">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_2.5fr]">
          <div>
            <Logo />
            <p className="mt-5 max-w-xs text-sm text-pretty text-ink-dim">
              The consented data layer for AI. Built on the assumption that the
              people who produce the data should be the people who profit from
              it.
            </p>
            <Link
              href="/docs"
              className="group mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink"
            >
              Read the docs
              <svg
                viewBox="0 0 16 16"
                className="h-3 w-3 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M6 3l5 5-5 5" strokeLinecap="round" />
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="text-xs font-medium text-ink">{column.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-ink-faint transition-colors hover:text-ink"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div>
              <h3 className="text-xs font-medium text-ink">Elsewhere</h3>
              <ul className="mt-4 space-y-2.5">
                {ELSEWHERE.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-faint transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-rule pt-8 sm:flex-row sm:items-center">
          <p className="font-mono text-xs text-ink-faint">
            © {new Date().getFullYear()} Datavar Labs
          </p>
          <div className="flex items-center gap-6">
            {/* One entry, because one exists. The X and LinkedIn placeholders
                are gone rather than parked here as dead text — an empty
                account list says less than a real repository does. */}
            <a
              href="https://github.com/AtaGuler0/datavar"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-ink-faint transition-colors hover:text-ink"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
