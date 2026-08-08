import { Logo } from "./logo";

const COLUMNS = [
  {
    title: "Product",
    links: ["How it works", "Earnings", "Data sources", "Payouts", "Security"],
  },
  {
    title: "For AI teams",
    links: ["Datasets", "Cohort builder", "API docs", "Pricing", "Talk to sales"],
  },
  {
    title: "Company",
    links: ["About", "Careers", "Blog", "Press", "Contact"],
  },
  {
    title: "Legal",
    links: [
      "Privacy policy",
      "Terms of service",
      "Consent framework",
      "Subprocessors",
      "DPA",
    ],
  },
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
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="text-xs font-medium text-ink">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {/* Not links. None of these pages exist yet, and an anchor
                      that quietly scrolls you back to the top is a worse
                      answer than one that never invited the click. They stay
                      visible because the shape of the product is worth
                      showing; they become links when they lead somewhere. */}
                  {column.links.map((link) => (
                    <li key={link} className="text-sm text-ink-faint">
                      {link}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
