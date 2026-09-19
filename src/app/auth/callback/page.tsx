"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { googleSession } from "@/lib/auth/google-client";

/**
 * Where Google sends the browser back to.
 *
 * The client was built with `detectSessionInUrl`, so asking it for the session
 * is also what completes the exchange — there is no code to write for the code
 * in the URL. This page exists to wait for that and then get out of the way.
 *
 * The page it returns to is read from the query string rather than from a
 * hook, and only a path is honoured: a `next` that names another origin is a
 * redirect out of the product with our sign-in attached to it.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;

    const params = new URLSearchParams(window.location.search);
    const requested = params.get("next") ?? "/dashboard";
    const next =
      requested.startsWith("/") && !requested.startsWith("//")
        ? requested
        : "/dashboard";

    // Google's own refusal — a declined consent screen — comes back as a
    // query parameter rather than as a missing session, and is the same
    // outcome: no session, so nothing to go on with.
    const settle = async () =>
      params.get("error") ? null : await googleSession();

    settle().then((session) => {
      if (!live) return;
      if (session) {
        router.replace(next);
      } else {
        setFailed(true);
      }
    });

    return () => {
      live = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper-sunken/30 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-rule bg-paper px-6 py-10 text-center shadow-sm shadow-ink/[0.03]">
        {failed ? (
          <>
            <p className="text-pretty text-ink-dim">
              That sign-in didn&apos;t complete. Nothing was changed.
            </p>
            <a
              href="/dashboard"
              className="mt-6 inline-flex items-center rounded-lg bg-slate-deep px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-slate"
            >
              Back to the dashboard
            </a>
          </>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-rule border-t-slate-deep"
            />
            <p className="mt-5 text-sm text-ink-dim">Signing you in…</p>
          </>
        )}
      </div>
    </main>
  );
}
