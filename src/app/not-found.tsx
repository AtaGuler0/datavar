import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

/**
 * The page for an address that isn't one.
 *
 * Until this file existed Next served its own: white background, system font,
 * "404: This page could not be found". It works, and it is a different website
 * as far as the person reading it is concerned — which is the wrong moment to
 * look like somebody else, because most of what lands here is a link from
 * outside that has gone stale.
 *
 * So it is the site, and it points somewhere. Two destinations rather than a
 * list: home for a reader who arrived from a search result, docs for one who
 * was already looking something up.
 */
export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main className="flex flex-1 items-center pt-16">
        <div className="mx-auto w-full max-w-2xl px-6 py-24 text-center">
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
            404
          </span>
          <h1 className="display mt-3 text-[2rem] font-medium text-balance text-ink sm:text-[2.5rem]">
            Nothing lives at this address.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-pretty text-ink-dim">
            The page either moved or was never published. If you followed a link
            to get here, it is pointing at something that is no longer there.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-lg bg-slate-deep px-6 py-3 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate sm:w-auto"
            >
              Back to the home page
            </Link>
            <Link
              href="/docs"
              className="inline-flex w-full items-center justify-center rounded-lg border border-rule bg-paper-raised px-6 py-3 text-sm font-medium text-ink transition-colors duration-200 hover:bg-paper-sunken sm:w-auto"
            >
              Read the docs
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
