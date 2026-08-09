/**
 * The operator side of the product. Deliberately short: the admin panel is
 * where the market gets run by hand until the buyer side is real, and nothing
 * more.
 */
export type AdminSection = {
  href: string;
  label: string;
  index: string;
  summary: string;
};

export const ADMIN_NAV: AdminSection[] = [
  {
    href: "/admin",
    label: "Overview",
    index: "00",
    summary: "Treasury balance, what's sold, and what's still owed.",
  },
  {
    href: "/admin/datasets",
    label: "Datasets",
    index: "01",
    summary: "Every contribution on the protocol, and what it sells for.",
  },
  {
    href: "/admin/sales",
    label: "Sales",
    index: "02",
    summary: "The full sale ledger and the payouts settled against it.",
  },
  {
    href: "/admin/blog",
    label: "Blog",
    index: "03",
    summary: "Write and publish posts without waiting for a deploy.",
  },
  {
    href: "/admin/demo",
    label: "Demo data",
    index: "04",
    summary: "Fill an empty protocol with plausible contributions.",
  },
];

/** Exact match for the root, prefix match for the deeper sections. */
export function isAdminSectionActive(href: string, pathname: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}
