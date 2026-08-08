import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

/**
 * The blog sits inside the marketing shell rather than the dashboard's, so a
 * reader who arrives from a link lands somewhere that looks like the product
 * and can walk into the rest of it.
 */
export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav />
      <main className="flex-1 pt-16">{children}</main>
      <SiteFooter />
    </>
  );
}
