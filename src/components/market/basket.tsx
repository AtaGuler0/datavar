"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/dashboard/wallet-provider";
import { formatBytes, formatDate } from "@/lib/format";
import { licenseBasket } from "@/lib/market";
import {
  explorerTxUrl,
  formatAmount,
  type PayAsset,
} from "@/lib/stellar/config";
import { sourceLabel } from "@/lib/supabase/datasets";
import { priceOf, type BuyerProfile, type Listing } from "@/lib/supabase/market";
import { BuyerProfileForm } from "./buyer-profile";

/**
 * The basket, and the checkout it opens into.
 *
 * What a buyer signs is one payment into the payout vault for the whole
 * basket — the same contract contributors claim from — so a ten-dataset order
 * is one wallet prompt and one hash, and the money is in a place both sides can
 * read. Nothing is charged until that signature, and nothing is written until
 * the ledger has closed on it.
 *
 * The panel says what the licence is before asking for the signature: the term
 * comes from the consent behind each dataset and cannot outlive it, which is a
 * sentence worth reading *before* paying rather than finding in a receipt.
 */

type Step = "idle" | "paying" | "done";

export function Basket({
  items,
  asset,
  profile,
  onProfileSaved,
  onRemove,
  onClear,
  onPurchased,
}: {
  items: Listing[];
  /** What the catalogue is priced in, and what this basket will be paid in. */
  asset: PayAsset;
  profile: BuyerProfile | null;
  onProfileSaved: (profile: BuyerProfile) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onPurchased: (ids: string[]) => void;
}) {
  const {
    address,
    session,
    status,
    connect,
    signIn,
    signTransaction,
    canSign,
    google,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    hash: string;
    licences: number;
    stroops: number;
    asset: PayAsset;
    warning?: string;
  } | null>(null);

  const total = items.reduce((sum, item) => sum + priceOf(item, asset), 0);

  // The licence term is the shortest consent in the basket: a receipt that ends
  // in 30 days does not last longer because it was bought alongside one that
  // ends in a year.
  const soonest = items.reduce<string | null>(
    (earliest, item) =>
      !earliest || item.consent_expires_at < earliest
        ? item.consent_expires_at
        : earliest,
    null,
  );

  // Escape closes the sheet, except while a payment is in flight — the wallet
  // has the signature at that point and closing would only hide the outcome.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "paying") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step]);

  if (items.length === 0 && step !== "done") return null;

  const pay = async () => {
    setStep("paying");
    setError(null);
    try {
      const ids = items.map((item) => item.id);
      const result = await licenseBasket(ids, asset, signTransaction);
      setReceipt(result);
      setStep("done");
      onPurchased(ids);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(
        /reject|denied|declin|cancel/i.test(message)
          ? "You declined the signature, so nothing was charged."
          : message || "The payment didn't go through.",
      );
      setStep("idle");
    }
  };

  return (
    <>
      {/* The bar is always reachable, on every screen size, and never covers a
          card's Add button — the results grid leaves room for it. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[110rem] items-center gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm text-ink">
              {items.length} dataset{items.length === 1 ? "" : "s"}
              <span className="mx-2 text-ink-faint">·</span>
              <span className="tabular-nums">
                {formatAmount(total, asset)} {asset}
              </span>
            </p>
            <p className="truncate text-xs text-ink-faint">
              One payment into the payout vault, one signature.
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="hidden text-xs text-ink-faint transition-colors hover:text-ink sm:inline"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-slate"
            >
              Review &amp; license
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Checkout"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && step !== "paying") setOpen(false);
          }}
        >
          <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-rule bg-paper shadow-xl shadow-ink/10 sm:rounded-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
              <div>
                <h2 className="text-sm font-medium text-ink">
                  {step === "done" ? "Licensed" : "Review licence"}
                </h2>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {asset === "USDC"
                    ? "Testnet USDC from the Turkish ramp. Nothing here moves real money."
                    : "Testnet XLM. Nothing here moves real money."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={step === "paying"}
                className="-mr-1 -mt-1 rounded-lg p-1.5 text-ink-faint transition-colors hover:text-ink disabled:opacity-40"
                aria-label="Close"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {step === "done" && receipt ? (
                <Done receipt={receipt} onClose={() => setOpen(false)} />
              ) : (
                <>
                  <ul className="space-y-px">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 border-b border-rule py-2.5 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink">
                            {sourceLabel(item.source_type)}
                          </p>
                          <p className="truncate font-mono text-[0.625rem] text-ink-faint">
                            {formatBytes(item.byte_size)} · receipt #
                            {item.consent_receipt_id} · to{" "}
                            {formatDate(item.consent_expires_at)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm tabular-nums text-ink-dim">
                          {formatAmount(priceOf(item, asset), asset)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemove(item.id)}
                          disabled={step === "paying"}
                          className="shrink-0 text-xs text-ink-faint transition-colors hover:text-ink disabled:opacity-40"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex items-baseline justify-between border-t border-rule-strong pt-4">
                    <span className="text-sm text-ink-dim">Total</span>
                    <span className="text-lg font-medium tabular-nums text-ink">
                      {formatAmount(total, asset)}{" "}
                      <span className="font-mono text-[0.625rem] text-ink-faint">
                        {asset}
                      </span>
                    </span>
                  </div>

                  <div className="mt-5 rounded-xl border border-rule bg-paper-raised/60 p-4">
                    <h3 className="eyebrow text-ink-faint">What you get</h3>
                    <ul className="mt-2.5 space-y-1.5 text-[0.8125rem] text-ink-dim">
                      <li>
                        Read access to each file for as long as the consent
                        behind it holds
                        {soonest && (
                          <>
                            {" "}
                            — the shortest in this basket ends{" "}
                            <span className="text-ink">{formatDate(soonest)}</span>
                          </>
                        )}
                        .
                      </li>
                      <li>
                        A licence record naming the receipt it stands on, which
                        resolves on the consent contract.
                      </li>
                      <li>
                        Your payment lands in the {asset} payout vault; the
                        contributors claim it from there with their own
                        signatures.
                      </li>
                    </ul>
                  </div>

                  {asset === "USDC" && (
                    <p className="mt-3 text-xs text-pretty text-ink-faint">
                      No USDC yet?{" "}
                      <Link
                        href="/anchor"
                        className="text-ink-dim underline decoration-rule-strong underline-offset-4 hover:text-ink"
                      >
                        Buy some with Turkish lira
                      </Link>{" "}
                      — it lands in this same wallet.
                    </p>
                  )}

                  {!session ? (
                    <div className="mt-5 rounded-xl border border-rule bg-paper-raised/60 p-4">
                      <p className="text-sm text-pretty text-ink-dim">
                        {address
                          ? "One signature proves this wallet is yours before you can license anything."
                          : google && !google.linked
                            ? `Signed in as ${google.email}. Connect a Stellar wallet to license data — it is how you pay and how the licence is recorded.`
                            : "Sign in to license data. A wallet is how you pay and how the licence is recorded."}
                      </p>
                      <button
                        type="button"
                        onClick={address ? signIn : connect}
                        disabled={status === "connecting" || status === "authenticating"}
                        className="mt-3 rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-slate disabled:opacity-60"
                      >
                        Sign in
                      </button>
                    </div>
                  ) : !canSign ? (
                    // Signed in through Google on a browser with no wallet
                    // attached. Everything else on this panel works; the
                    // payment is the one thing nobody but them can do.
                    <div className="mt-5 rounded-xl border border-rule bg-paper-raised/60 p-4">
                      <p className="text-sm text-pretty text-ink-dim">
                        You&apos;re signed in
                        {google?.email ? ` as ${google.email}` : ""}, but the
                        payment is a transaction into the vault and only your
                        wallet can sign it. We hold no key, by design.
                      </p>
                      <button
                        type="button"
                        onClick={connect}
                        disabled={status === "connecting"}
                        className="mt-3 rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-slate disabled:opacity-60"
                      >
                        {status === "connecting" ? "Connecting…" : "Connect wallet"}
                      </button>
                    </div>
                  ) : !profile ? (
                    <div className="mt-5 rounded-xl border border-rule bg-paper-raised/60 p-4">
                      <h3 className="text-sm font-medium text-ink">
                        Who is licensing this?
                      </h3>
                      <div className="mt-3">
                        <BuyerProfileForm
                          wallet={session.wallet}
                          profile={null}
                          onSaved={onProfileSaved}
                          compact
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-5 text-[0.8125rem] text-ink-faint">
                      Licensing as{" "}
                      <span className="text-ink-dim">{profile.org}</span>.{" "}
                      <Link
                        href="/market/profile"
                        className="underline decoration-rule-strong underline-offset-4 hover:text-ink"
                      >
                        Change it
                      </Link>
                    </p>
                  )}

                  {error && (
                    <p className="mt-4 text-sm text-pretty text-fall">{error}</p>
                  )}
                </>
              )}
            </div>

            {step !== "done" && (
              <footer className="border-t border-rule px-5 py-4">
                <button
                  type="button"
                  onClick={pay}
                  disabled={
                    step === "paying" ||
                    !session ||
                    !canSign ||
                    !profile ||
                    items.length === 0
                  }
                  className="w-full rounded-lg bg-slate-deep px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-slate disabled:opacity-60"
                >
                  {step === "paying"
                    ? "Waiting for your wallet…"
                    : `Pay ${formatAmount(total, asset)} ${asset}`}
                </button>
              </footer>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Done({
  receipt,
  onClose,
}: {
  receipt: {
    hash: string;
    licences: number;
    stroops: number;
    asset: PayAsset;
    warning?: string;
  };
  onClose: () => void;
}) {
  return (
    <div className="py-2 text-center">
      <p className="text-2xl font-medium tabular-nums text-ink">
        {formatAmount(receipt.stroops, receipt.asset)}{" "}
        <span className="font-mono text-xs text-ink-faint">{receipt.asset}</span>
      </p>
      <p className="mt-1 text-sm text-ink-dim">
        {receipt.licences} licence{receipt.licences === 1 ? "" : "s"} recorded.
      </p>

      {receipt.warning && (
        <p className="mx-auto mt-4 max-w-sm text-pretty text-sm text-fall">
          {receipt.warning}
        </p>
      )}

      <a
        href={explorerTxUrl(receipt.hash)}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-block break-all font-mono text-[0.6875rem] text-slate underline-offset-4 hover:underline"
      >
        {receipt.hash}
      </a>

      <div className="mt-6 flex justify-center gap-2">
        <Link
          href="/market/licences"
          onClick={onClose}
          className="rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-slate"
        >
          Open your licences
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-rule px-4 py-2 text-sm text-ink-dim transition-colors hover:text-ink"
        >
          Keep browsing
        </button>
      </div>
    </div>
  );
}
