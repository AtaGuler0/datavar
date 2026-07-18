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
            <p className="mt-6 font-mono text-[0.6875rem] text-ink-faint">
              SOC 2 Type II · GDPR · CCPA
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="text-xs font-medium text-ink">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#top"
                        className="text-sm text-ink-faint transition-colors hover:text-ink"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-rule pt-8 sm:flex-row sm:items-center">
          <p className="font-mono text-xs text-ink-faint">
            © {new Date().getFullYear()} Datavar Labs, Inc.
          </p>
          <div className="flex items-center gap-6">
            {["X", "LinkedIn", "GitHub"].map((social) => (
              <a
                key={social}
                href="#top"
                className="font-mono text-xs text-ink-faint transition-colors hover:text-ink"
              >
                {social}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
