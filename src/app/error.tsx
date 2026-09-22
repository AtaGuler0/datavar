"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";

/**
 * The page a render failure falls back to.
 *
 * Same argument as not-found.tsx — Next's own is unstyled and belongs to
 * nobody — plus one thing that page has no use for: a way back in. A boundary
 * that only apologises makes the reader reload by hand, which throws away the
 * navigation they were in the middle of, so retrying is offered first.
 *
 * `retry` rather than `reset`, which this version of Next keeps but steers
 * away from. The difference decides whether the button works here: `reset`
 * clears the boundary and re-renders the same children against the data that
 * already failed, while `retry` fetches the segment again. Almost everything
 * that lands on this page is a request that did not come back — a Supabase
 * read, a contract simulation — so a button that does not re-fetch would fail
 * a second time in front of somebody who had just been told to try again.
 *
 * The digest is the reason this is worth more than a sentence. Next replaces a
 * server error's message with an opaque id before it reaches the browser, on
 * purpose: the message can name a missing variable, and lib/log.ts refuses to
 * put one in front of a caller for exactly that reason. The id is the half that
 * is safe to show, and it is the only thing that joins what somebody saw to the
 * line the deployment log wrote about it.
 *
 * No footer here. SiteFooter renders on the server, this boundary cannot, and a
 * column of links is not what the moment calls for anyway.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The class and the message, never the stack — the same rule the server
    // side keeps in lib/log.ts.
    console.error(`[render] ${error.name}: ${error.message}`);
  }, [error]);

  return (
    <>
      <SiteNav />
      <main className="flex flex-1 items-center pt-16">
        <div className="mx-auto w-full max-w-2xl px-6 py-24 text-center">
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
            Error
          </span>
          <h1 className="display mt-3 text-[2rem] font-medium text-balance text-ink sm:text-[2.5rem]">
            That page didn&rsquo;t load.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-pretty text-ink-dim">
            The failure is on our side. Trying again is worth doing once,
            because most of what breaks here is a request that did not come
            back rather than a page that cannot be built.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex w-full items-center justify-center rounded-lg bg-slate-deep px-6 py-3 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate sm:w-auto"
            >
              Try again
            </button>
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-lg border border-rule bg-paper-raised px-6 py-3 text-sm font-medium text-ink transition-colors duration-200 hover:bg-paper-sunken sm:w-auto"
            >
              Back to the home page
            </Link>
          </div>

          {error.digest ? (
            <p className="mt-8 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}
