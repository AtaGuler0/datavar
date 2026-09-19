"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/components/dashboard/wallet-provider";
import { readLinkedAccount } from "@/lib/supabase/account";
import { GoogleButton } from "./google-button";

/**
 * The Google account attached to this wallet, and the two buttons that change
 * that.
 *
 * Read from the database rather than from whatever is in this browser, so an
 * account attached on a phone shows up on a laptop. What it says about the
 * limits of the thing is not decoration: somebody who attaches Google and then
 * finds their payout claim still asking for a wallet should have read why here
 * first.
 *
 * Two tones because it appears on two surfaces — the contributor's dark
 * account panel and the buyer's profile page — and the same words belong on
 * both. It was written once, in the dark panel, and moved here the moment the
 * second surface existed rather than copied.
 */
export function GoogleLink({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { session, canSign, google, googleError, linkGoogle, unlinkGoogle } =
    useWallet();

  const [linked, setLinked] = useState<{ email: string | null } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const wallet = session?.wallet ?? null;
  const signedInAs = google?.linked ? google.email : null;

  useEffect(() => {
    if (!wallet) return;
    let live = true;
    readLinkedAccount()
      .then((account) => {
        if (!live) return;
        setLinked(account ? { email: account.email } : null);
        setLoaded(true);
      })
      .catch(() => {
        // The table not being there yet is a deployment state, not an error
        // worth a red box on somebody's account panel.
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [wallet, signedInAs]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      const account = await readLinkedAccount().catch(() => null);
      setLinked(account ? { email: account.email } : null);
    } finally {
      setBusy(false);
    }
  };

  if (!wallet || !loaded) return null;

  const dark = tone === "dark";
  const email = linked?.email ?? signedInAs;

  return (
    <div
      className={
        dark
          ? "flex flex-col gap-4 border-t border-ink-800 px-7 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-9"
          : "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      <div className="max-w-md">
        <p className={`eyebrow ${dark ? "text-chalk-faint" : "text-ink-faint"}`}>
          Google
        </p>
        <p
          className={`mt-2 text-sm text-pretty ${dark ? "text-chalk-dim" : "text-ink-dim"}`}
        >
          {linked ? (
            <>
              <span className={dark ? "text-chalk" : "text-ink"}>
                {email ?? "Attached"}
              </span>{" "}
              gets you back into this wallet without your extension. It still
              can&apos;t sign: consent, payouts and purchases ask the wallet,
              because we hold no key.
            </>
          ) : (
            <>
              Attach a Google account and the next sign-in is a click instead of
              a browser extension. It reaches this wallet and nothing else, and
              it never gains the ability to sign for you.
            </>
          )}
        </p>
        {googleError && (
          <p className="mt-2 text-sm text-pretty text-fall">{googleError}</p>
        )}
        {linked && !canSign && (
          <p
            className={`mt-2 text-xs ${dark ? "text-chalk-faint" : "text-ink-faint"}`}
          >
            You&apos;re in through Google right now, so anything that needs a
            signature will ask you to connect your wallet first.
          </p>
        )}
      </div>

      {linked ? (
        <button
          type="button"
          onClick={() => run(unlinkGoogle)}
          disabled={busy}
          className={
            dark
              ? "inline-flex shrink-0 items-center justify-center rounded-lg border border-ink-800 bg-ink-900 px-4 py-2.5 text-sm text-chalk-dim transition-colors hover:border-rule-dark-strong hover:text-chalk disabled:opacity-60"
              : "inline-flex shrink-0 items-center justify-center rounded-lg border border-rule px-4 py-2.5 text-sm text-ink-dim transition-colors hover:border-rule-strong hover:text-ink disabled:opacity-60"
          }
        >
          {busy ? "Detaching…" : "Detach"}
        </button>
      ) : (
        <GoogleButton
          tone={tone}
          label="Attach Google"
          onClick={() => run(linkGoogle)}
          disabled={busy}
        />
      )}
    </div>
  );
}
