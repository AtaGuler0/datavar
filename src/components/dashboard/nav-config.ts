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
  {
    href: "/dashboard/sources",
    label: "Sources",
    index: "01",
    summary: "The accounts, devices and files you've connected.",
  },
  {
    href: "/dashboard/uploads",
    label: "Uploads",
    index: "02",
    summary: "Datasets you contribute directly, hashed before they leave.",
  },
  {
    href: "/dashboard/consent",
    label: "Consent",
    index: "03",
    summary: "Every signed receipt, who holds it, and when it expires.",
  },
  {
    href: "/dashboard/earnings",
    label: "Earnings",
    index: "04",
    summary: "What you've been paid, and how you're paid out.",
  },
];

/** Exact match for Overview, prefix match for the deeper sections. */
export function isSectionActive(href: string, pathname: string): boolean {
  return href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname.startsWith(href);
}
