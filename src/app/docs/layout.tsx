import type { ReactNode } from "react";
import { DocsSideNav } from "@/components/docs/side-nav";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

/**
 * Docs sit inside the marketing shell, like the blog — someone who arrives
 * from a search result should land somewhere that looks like the product and
 * be able to walk into the rest of it.
 *
 * The rail is a column of the same max-w-6xl grid the rest of the site uses,
 * so the prose column lines up with every other page's content edge.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav />
      <main className="flex-1 pt-16">
        <div className="mx-auto grid max-w-6xl gap-x-12 px-6 md:grid-cols-[13.5rem_1fr]">
          <DocsSideNav />
          {/* min-w-0: without it a wide code block widens the grid column and
              the whole page scrolls sideways. */}
          <div className="min-w-0">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
