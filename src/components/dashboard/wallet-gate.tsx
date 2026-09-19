"use client";

import type { ReactNode } from "react";
import { useWallet } from "./wallet-provider";

/**
 * Gates a section's content behind a signed-in wallet. The page heading stays
 * visible either way — you should always know where you are — but nothing that
 * depends on an identity renders until there is a proved one.
 *
 * Connected and signed in are separate states here because they are separate
 * facts. A connected wallet has told us an address; a signed-in one has proved
 * it holds the key, and only that gets a session the database will accept.
 * Rendering the dashboard for a merely-connected wallet would show empty
 * panels and blame the network for it.
 *
 * Google adds a fourth state and it is the one worth being careful about: an
 * account signed in here but never attached to a wallet. It is not a failure
 * and the panel does not treat it as one, but it cannot be the way in either —
 * there is no address behind it yet, and an address is what everything below
 * this gate is keyed to.
 *
 * Loading and mid-signature both render the skeleton, so a restored session
 * doesn't flash the gate on the way in.
 */
export function WalletGate({
  children,
  message,
}: {
  children: ReactNode;
  message?: string;
}) {
  const { status, session, connect, signIn, signInError, google, googleError } =
    useWallet();

  if (status === "loading" || status === "authenticating") {
    return (
      <div className="mt-10 h-40 animate-pulse rounded-2xl border border-rule bg-paper-raised" />
    );
  }

  if (status === "connected" && session) {
    return <>{children}</>;
  }

  // Connected but unproved: the wallet is there, the signature isn't. Usually
  // because it was declined, or because a session expired overnight.
  if (status === "connected") {
    return (
      <Panel
        message={
          signInError ??
          "One signature proves this wallet is yours. It's a Stellar challenge transaction that can never reach the network, and nothing else."
        }
        label="Sign in"
        onClick={signIn}
      />
    );
  }

  // Signed in with Google, with nothing behind it yet. Said plainly, because
  // the alternative is a person who believes they are signed in looking at an
  // empty dashboard and concluding their data is gone.
  if (google && !google.linked) {
    return (
      <Panel
        message={
          googleError ??
          `Signed in as ${google.email}. Connect the Stellar wallet that owns your data to finish — after this once, Google is enough to get back in.`
        }
        label="Connect wallet"
        onClick={connect}
      />
    );
  }

  return (
    <Panel
      message={message ?? "Sign in to see this."}
      label={status === "connecting" ? "Opening…" : "Sign in"}
      onClick={connect}
      disabled={status === "connecting"}
      note={
        googleError ??
        "A Stellar wallet, or the Google account you attached to one."
      }
    />
  );
}

function Panel({
  message,
  label,
  onClick,
  disabled,
  note,
}: {
  message: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <div className="mt-10 rounded-2xl border border-rule bg-paper px-6 py-14 text-center shadow-sm shadow-ink/[0.03]">
      <div
        aria-hidden="true"
        className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg border border-rule bg-paper-raised/60 text-ink-dim"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="2" y="4" width="12" height="9" rx="1.5" />
          <path d="M2 6.5h9" strokeLinecap="round" />
          <path d="M10.5 10h2" strokeLinecap="round" />
        </svg>
      </div>
      <p className="mx-auto mt-5 max-w-sm text-pretty text-ink-dim">{message}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-6 inline-flex items-center rounded-lg bg-slate-deep px-5 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate disabled:opacity-70"
      >
        {label}
      </button>
      {note && (
        <p className="mx-auto mt-4 max-w-sm text-pretty text-xs text-ink-faint">
          {note}
        </p>
      )}
    </div>
  );
}
