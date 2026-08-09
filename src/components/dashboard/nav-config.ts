/**
 * The contributor side of the product. Each section is a route under
 * /dashboard; the two-digit index mirrors the landing page's step numbering
 * so the mark of the product stays consistent once you're inside it.
 */
export type DashboardSection = {
  href: string;
  label: string;
  index: string;
  summary: string;
};

export const CONTRIBUTOR_NAV: DashboardSection[] = [
  {
    href: "/dashboard",
    label: "Overview",
    index: "00",
    summary: "Where your data, consent and payouts stand this month.",
  },
  // Sources and Uploads used to be two sections. They were one thing seen
  // twice: a dataset arrives, gets consented to, gets licensed, gets paid for.
  // Splitting the arrival from the consent left the step that actually blocks
  // earnings — a dataset nobody may license — visible from neither.
  {
    href: "/dashboard/data",
    label: "Your data",
    index: "01",
    summary: "Everything you've contributed, and what each dataset needs next.",
  },
  {
    href: "/dashboard/consent",
    label: "Consent",
    index: "02",
    summary: "Every signed receipt, who holds it, and when it expires.",
  },
  {
    href: "/dashboard/earnings",
    label: "Earnings",
    index: "03",
    summary: "What you've been paid, and how you're paid out.",
  },
];

/** Exact match for Overview, prefix match for the deeper sections. */
export function isSectionActive(href: string, pathname: string): boolean {
  return href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname.startsWith(href);
}
