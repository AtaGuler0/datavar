"use client";

import { useEffect, useRef, useState } from "react";
import { truncateAddress } from "@/lib/stellar/config";
import { useWallet } from "./wallet-provider";

/**
 * The wallet control in the top bar. Disconnected → a connect button that
 * opens the kit's wallet picker. Connected → the truncated address with a
 * small menu to copy it or disconnect.
 */
export function WalletButton() {
  const { address, status, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the menu on an outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (status === "loading") {
    return (
      <span className="inline-flex h-9 w-32 animate-pulse rounded-lg bg-paper-sunken" />
    );
  }

  if (!address) {
    return (
      <button
        type="button"
        onClick={connect}
        disabled={status === "connecting"}
        className="inline-flex items-center rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate disabled:opacity-70"
      >
        {status === "connecting" ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-rule bg-paper-raised px-3 py-2 text-sm text-ink transition-colors hover:border-rule-strong"
      >
        <span className="font-mono text-xs tabular-nums">
          {truncateAddress(address)}
        </span>
        <svg
          viewBox="0 0 16 16"
          className={`h-3 w-3 text-ink-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-rule bg-paper py-1 shadow-lg shadow-ink/5">
          <button
            type="button"
            onClick={copy}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-ink-dim transition-colors hover:bg-paper-raised hover:text-ink"
          >
            Copy address
            {copied && (
              <span className="font-mono text-[0.625rem] text-slate">Copied</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
            className="w-full px-3 py-2 text-left text-sm text-ink-dim transition-colors hover:bg-paper-raised hover:text-ink"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
