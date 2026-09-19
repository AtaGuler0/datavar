"use client";

import { useEffect } from "react";
import type { ISupportedWallet } from "@creit.tech/stellar-wallets-kit";

/**
 * The sign-in sheet, in the product's paper/ink language — the kit only
 * supplies the wallet list and the connection; every pixel here is ours.
 * Installed wallets are buttons; missing ones link out to install instead of
 * pretending they could connect.
 *
 * Both ways in live here rather than as two buttons in every header. A person
 * arriving does not want to be asked which authentication scheme they prefer
 * before they have been asked who they are; they want one door. Google sits at
 * the top because it is the shorter route for somebody coming back, and the
 * wallets sit below it because that is what the shorter route leads to.
 */
export function WalletPicker({
  wallets,
  connectingId,
  error,
  google,
  onChoose,
  onGoogle,
  onClose,
}: {
  wallets: ISupportedWallet[] | null;
  connectingId: string | null;
  error: string | null;
  /** The Google account already signed in here, if there is one. */
  google: { email: string; linked: boolean } | null;
  onChoose: (wallet: ISupportedWallet) => void;
  onGoogle: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = wallets
    ? [...wallets].sort(
        (a, b) => Number(b.isAvailable) - Number(a.isAvailable),
      )
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-rule bg-paper shadow-2xl shadow-ink-950/20">
        <div className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
          <div>
            <p className="eyebrow text-ink-faint">
              {google && !google.linked ? "One step left" : "Sign in"}
            </p>
            <p className="mt-2 text-sm text-pretty text-ink-dim">
              {google && !google.linked ? (
                <>
                  Signed in as{" "}
                  <span className="text-ink">{google.email}</span>. Connect the
                  wallet that owns your data to finish — after this once, Google
                  is enough.
                </>
              ) : (
                "Your wallet is your identity here, and Google only gets you back to it."
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded-lg p-1 text-ink-faint transition-colors hover:bg-paper-raised hover:text-ink"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-3">
          {/* First, because for anyone who has been here before it is the last
              button they need to press. Hidden once a Google account is signed
              in and waiting for a wallet: offering it again would hand them the
              account they are already holding and change nothing. */}
          {!(google && !google.linked) && (
          <button
            type="button"
            onClick={onGoogle}
            disabled={connectingId !== null}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-paper-raised disabled:opacity-60 disabled:hover:bg-transparent"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-rule bg-paper">
              <GoogleMark />
            </span>
            <span className="flex-1 truncate text-sm font-medium text-ink">
              Continue with Google
            </span>
            <svg
              viewBox="0 0 16 16"
              className="h-3 w-3 text-ink-faint"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M6 3l5 5-5 5" strokeLinecap="round" />
            </svg>
          </button>
          )}

          {!(google && !google.linked) && (
            <div className="my-2 flex items-center gap-3 px-3">
              <span className="h-px flex-1 bg-rule" />
              <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
                or a wallet
              </span>
              <span className="h-px flex-1 bg-rule" />
            </div>
          )}

          {list === null ? (
            <div className="space-y-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-xl bg-paper-sunken/60"
                />
              ))}
            </div>
          ) : (
            <ul className="space-y-1">
              {list.map((w) => (
                <li key={w.id}>
                  {w.isAvailable ? (
                    <button
                      type="button"
                      onClick={() => onChoose(w)}
                      disabled={connectingId !== null}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-paper-raised disabled:opacity-60 disabled:hover:bg-transparent"
                    >
                      <WalletMark id={w.id} />
                      <span className="flex-1 truncate text-sm font-medium text-ink">
                        {w.name}
                      </span>
                      {connectingId === w.id ? (
                        <span className="font-mono text-[0.6875rem] text-ink-faint">
                          Connecting…
                        </span>
                      ) : (
                        <svg
                          viewBox="0 0 16 16"
                          className="h-3 w-3 text-ink-faint"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M6 3l5 5-5 5" strokeLinecap="round" />
                        </svg>
                      )}
                    </button>
                  ) : (
                    <div className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5">
                      <WalletMark id={w.id} dim />
                      <span className="flex-1 truncate text-sm text-ink-dim">
                        {w.name}
                      </span>
                      <a
                        href={w.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-rule bg-paper-raised/60 px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-faint transition-colors hover:border-rule-strong hover:text-ink"
                      >
                        Install ↗
                      </a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="mt-2 rounded-xl border border-rule bg-paper-raised/60 px-3.5 py-2.5 text-sm text-fall">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-rule bg-paper-raised/50 px-6 py-3.5">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
            Stellar testnet
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The wallet marks, served from this origin.
 *
 * The kit points at `stellar.creit.tech/wallet-icons/*.png`, and two things
 * are wrong with loading them from there. The policy in next.config.ts
 * allowlists `img-src`, so they were blocked and every wallet rendered as an
 * empty square — which is how this was noticed. And opening a sign-in sheet
 * should not tell a third party that somebody opened a sign-in sheet.
 *
 * So the four wallets this product loads have their icons in `public/wallets`.
 * A wallet the kit adds later falls through to a neutral square rather than to
 * a remote URL that the policy would refuse anyway.
 */
const ICONS: Record<string, string> = {
  freighter: "/wallets/freighter.png",
  xbull: "/wallets/xbull.png",
  albedo: "/wallets/albedo.png",
  lobstr: "/wallets/lobstr.png",
};

function iconFor(id: string): string | null {
  return ICONS[id.toLowerCase()] ?? null;
}

/** Google's mark, drawn rather than fetched from a Google CDN. */
function WalletMark({ id, dim }: { id: string; dim?: boolean }) {
  const src = iconFor(id);
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={`h-7 w-7 shrink-0 rounded-lg border border-rule bg-paper-raised ${dim ? "opacity-45" : ""}`}
      />
    );
  }
  const className = `h-7 w-7 shrink-0 rounded-lg ${dim ? "opacity-45" : ""}`;
  // A 28-pixel icon from our own public directory, already the size it is
  // drawn at. next/image would add a request to optimise nothing.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className} />;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
