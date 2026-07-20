"use client";

import { useEffect } from "react";
import type { ISupportedWallet } from "@creit.tech/stellar-wallets-kit";

/**
 * Our own wallet picker, in the product's paper/ink language — the kit only
 * supplies the wallet list and the connection; every pixel here is ours.
 * Installed wallets are buttons; missing ones link out to install instead of
 * pretending they could connect.
 */
export function WalletPicker({
  wallets,
  connectingId,
  error,
  onChoose,
  onClose,
}: {
  wallets: ISupportedWallet[] | null;
  connectingId: string | null;
  error: string | null;
  onChoose: (wallet: ISupportedWallet) => void;
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
      aria-label="Connect a wallet"
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
            <p className="eyebrow text-ink-faint">Connect a wallet</p>
            <p className="mt-2 text-sm text-pretty text-ink-dim">
              Your wallet is your identity here. No email, no password.
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
                      {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons come from the kit, arbitrary origins */}
                      <img
                        src={w.icon}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-lg"
                      />
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
                      {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons come from the kit, arbitrary origins */}
                      <img
                        src={w.icon}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-lg opacity-45"
                      />
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
