import Link from "next/link";
import { CONTACT } from "@/lib/contact";
import { Logo } from "./logo";

/**
 * The marketing footer, kept to what someone at the bottom of a page is
 * actually looking for: one short column each for the product, the reading
 * and the people, and the legal page.
 *
 * It used to list every docs page one by one under four headings — two of
 * them to the same URL. The docs have their own index and side nav for that;
 * one link to them does the job, and the footer stops being a sitemap.
 */

type FooterLink = { label: string; href: string; external?: boolean };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Contribute", href: "/dashboard" },
      { label: "Marketplace", href: "/market" },
      { label: "Protocol", href: "/protocol" },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Licensing", href: "/docs/licensing" },
      { label: "Blog", href: "/blog" },
    ],
  },
  {
    // Only accounts someone answers. The X and LinkedIn placeholders are gone
    // rather than parked here as dead text.
    title: "Contact",
    links: [
      { label: "Telegram", href: CONTACT.telegram.href, external: true },
      { label: "Email", href: CONTACT.email.href, external: true },
      { label: "GitHub", href: "https://github.com/AtaGuler0/datavar", external: true },
    ],
  },
];

// Padded into a tap-sized target below sm, with the list's spacing taken
// down by the same amount so the column keeps its rhythm.
const linkClass =
  "inline-block py-1.5 text-sm text-star-faint transition-colors hover:text-star sm:py-0";

export function SiteFooter() {
  return (
    <footer className="overflow-hidden border-t border-line bg-night">
      <div className="mx-auto max-w-6xl px-6 pt-16 pb-10">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-pretty text-star-dim">
              The consented data layer for AI.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-8 sm:gap-14">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="text-xs text-star-ghost">{column.title}</h3>
                <ul className="mt-2 space-y-0.5 sm:mt-3 sm:space-y-2">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target={link.href.startsWith("http") ? "_blank" : undefined}
                          rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                          className={linkClass}
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link href={link.href} className={linkClass}>
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-line pt-6 font-mono text-xs text-star-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} Datavar Labs
            <span aria-hidden="true" className="mx-3 text-star-ghost">
              ·
            </span>
            {/* One legal page, not two: the terms and the privacy half
                describe the same arrangement from opposite ends. */}
            <Link href="/docs/terms" className="-my-2 inline-block py-2 transition-colors hover:text-star">
              Terms &amp; Privacy
            </Link>
          </p>
          <p>Stellar testnet</p>
        </div>
      </div>

      <p
        aria-hidden="true"
        className="mx-auto max-w-6xl px-6 pb-10 text-center font-pixel leading-[0.9] text-star select-none"
        style={{ fontSize: "clamp(3.5rem, 17vw, 13.5rem)" }}
      >
        Datavar
      </p>
    </footer>
  );
}
