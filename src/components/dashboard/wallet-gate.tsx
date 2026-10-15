"use client";

import type { ReactNode } from "react";
import { PillButton } from "../night";
import { Corners } from "./primitives";
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
  figure,
}: {
  children: ReactNode;
  message?: string;
  /** The page's own drawing, shown beside the way in. */
  figure?: ReactNode;
}) {
  const { status, session, connect, signIn, signInError, google, googleError } =
    useWallet();

  if (status === "loading" || status === "authenticating") {
    return (
      <div className="mt-10 h-40 animate-pulse rounded-xl border border-line bg-white/[0.02]" />
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
        figure={figure}
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
        figure={figure}
      />
    );
  }

  return (
    <Panel
      message={message ?? "Sign in to see this."}
      label={status === "connecting" ? "Opening…" : "Sign in"}
      onClick={connect}
      disabled={status === "connecting"}
      figure={figure}
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
  figure,
}: {
  message: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  note?: string;
  figure?: ReactNode;
}) {
  return (
    <section className="relative mt-10 overflow-hidden rounded-xl border border-line bg-white/[0.018]">
      <Corners />
      <div className="grid items-center gap-8 p-7 sm:p-9 lg:grid-cols-[1fr_0.9fr]">
        <div className="max-w-md">
          <p className="font-mono text-[0.6875rem] tracking-[0.1em] text-star-faint uppercase">
            Wallet required
          </p>
          <p className="mt-5 text-[1.5rem] leading-[1.15] font-medium tracking-[-0.03em] text-pretty text-star">
            {message}
          </p>
          <div className="mt-7">
            <PillButton onClick={onClick} disabled={disabled}>
              {label}
            </PillButton>
          </div>
          {note && (
            <p className="mt-4 text-[0.8125rem] text-pretty text-star-faint">{note}</p>
          )}
        </div>
        {figure && <div className="hidden lg:block">{figure}</div>}
      </div>
    </section>
  );
}
