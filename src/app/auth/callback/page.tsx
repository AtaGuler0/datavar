"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeGoogleRedirect, googleSession } from "@/lib/auth/google-client";

/**
 * Where Google sends the browser back to.
 *
 * Two ways in. With NEXT_PUBLIC_GOOGLE_CLIENT_ID set, Google comes straight
 * here with an ID token in the fragment, and `completeGoogleRedirect` trades it
 * for a Supabase session. Without it, Supabase's own OAuth flow lands here with
 * a `?code=`, and the client's `detectSessionInUrl` completes that exchange the
 * moment the session is asked for. Either way this page waits and then gets
 * out of the way.
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

    // Resolved against our own origin and kept only if it stays there. A
    // prefix check on the raw string misses `/\\evil.com` and `/%09/evil.com`,
    // which browsers read as another host.
    const safe = (requested: string | null) => {
      try {
        const url = new URL(requested ?? "/dashboard", window.location.origin);
        if (url.origin === window.location.origin) {
          return url.pathname + url.search + url.hash;
        }
      } catch {
        // Not a URL at all: fall through to the default.
      }
      return "/dashboard";
    };

    const settle = async (): Promise<string | null> => {
      // The direct flow first: it must read the fragment before anything
      // creates the Supabase auth client.
      const direct = await completeGoogleRedirect();
      if (direct !== null) return safe(direct);

      // Google's own refusal in the Supabase flow comes back as a query
      // parameter rather than as a missing session, and is the same outcome.
      if (params.get("error")) return null;
      return (await googleSession()) ? safe(params.get("next")) : null;
    };

    settle()
      .catch(() => null)
      .then((next) => {
        if (!live) return;
        if (next) {
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
      <div className="w-full max-w-sm rounded-2xl border border-rule bg-paper px-6 py-10 text-center shadow-sm shadow-black/40">
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
