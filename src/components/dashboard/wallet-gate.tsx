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
  const { status, session, connect, signIn, signInError } = useWallet();

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

  return (
    <Panel
      message={message ?? "Connect your wallet to see this."}
      label={status === "connecting" ? "Connecting…" : "Connect wallet"}
      onClick={connect}
      disabled={status === "connecting"}
    />
  );
}

function Panel({
  message,
  label,
  onClick,
  disabled,
}: {
  message: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
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
    </div>
  );
}
