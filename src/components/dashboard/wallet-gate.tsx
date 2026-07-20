"use client";

import type { ReactNode } from "react";
import { useWallet } from "./wallet-provider";

/**
 * Gates a section's content behind a connected wallet. The page heading stays
 * visible either way — you should always know where you are — but nothing that
 * depends on an identity renders until there is one.
 *
 * Disconnected → a quiet panel that names what's missing and offers to connect.
 * Loading      → a neutral skeleton so restored sessions don't flash the gate.
 */
export function WalletGate({
  children,
  message,
}: {
  children: ReactNode;
  message?: string;
}) {
  const { status, connect } = useWallet();

  if (status === "loading") {
    return (
      <div className="mt-10 h-40 animate-pulse rounded-2xl border border-rule bg-paper-raised" />
    );
  }

  if (status === "connected") {
    return <>{children}</>;
  }

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
      <p className="mt-5 text-pretty text-ink-dim">
        {message ?? "Connect your wallet to see this."}
      </p>
      <button
        type="button"
        onClick={connect}
        disabled={status === "connecting"}
        className="mt-6 inline-flex items-center rounded-lg bg-slate-deep px-5 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate disabled:opacity-70"
      >
        {status === "connecting" ? "Connecting…" : "Connect wallet"}
      </button>
    </div>
  );
}
