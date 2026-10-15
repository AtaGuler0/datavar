"use client";

import { GoogleLink } from "@/components/auth/google-link";
import { truncateAddress } from "@/lib/stellar/config";
import { WalletFigure } from "../app-figures";
import { ghostButton, PillButton } from "../night";
import { Corners } from "./primitives";
import { useWallet } from "./wallet-provider";

/**
 * The enterprise block from the landing page, reused as the account state on
 * the overview.
 *
 * Three states, because connected and signed in stopped being the same thing:
 * no wallet at all, a wallet that has told us an address but not proved it,
 * and a proved one. The middle state used to read "Signed in as …", which was
 * the wrong claim — nothing keyed to that address would load.
 */
export function ConnectPanel() {
  const {
    address,
    status,
    session,
    connect,
    disconnect,
    signIn,
    signInError,
  } = useWallet();
  const connected = status === "connected" && address;
  const signedIn = connected && !!session;

  return (
    <section className="relative overflow-hidden rounded-xl border border-line bg-white/[0.018]">
      <Corners />
      <div className="grid items-center gap-8 p-7 sm:p-9 lg:grid-cols-[1fr_0.9fr]">
        <div className="max-w-md">
          <p className="flex items-center gap-2.5 font-mono text-[0.6875rem] tracking-[0.1em] text-star-faint uppercase">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${signedIn ? "bg-signal" : connected ? "bg-star-faint" : "bg-star-ghost"}`}
            />
            {signedIn ? "Signed in" : connected ? "Connected · not signed in" : "Not connected"}
          </p>
          {signedIn ? (
            <>
              <p className="mt-5 text-[1.5rem] leading-tight font-medium tracking-[-0.03em] text-balance text-star">
                Signed in as{" "}
                <span className="font-mono text-[1.125rem] tracking-normal text-star-dim">
                  {truncateAddress(address)}
                </span>
              </p>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-pretty text-star-dim">
                Your sources, consent receipts and payouts are all keyed to this
                wallet. We&apos;re on testnet, so no real funds move yet.
              </p>
            </>
          ) : connected ? (
            <>
              <p className="mt-5 text-[1.5rem] leading-tight font-medium tracking-[-0.03em] text-balance text-star">
                Connected as{" "}
                <span className="font-mono text-[1.125rem] tracking-normal text-star-dim">
                  {truncateAddress(address)}
                </span>
                <span className="text-star-faint">, one signature to go.</span>
              </p>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-pretty text-star-dim">
                {signInError ??
                  "One signature proves the wallet is yours. It's a challenge transaction that can never reach the network, and nothing of yours loads until it's done."}
              </p>
            </>
          ) : (
            <>
              <p className="mt-5 text-[1.75rem] leading-[1.1] font-medium tracking-[-0.035em] text-balance">
                <span className="text-star">Your wallet is your account.</span>{" "}
                <span className="text-star-faint">Nothing moves until you sign.</span>
              </p>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-pretty text-star-dim">
                Payouts land in the same wallet. Testnet, so no real funds move
                yet.
              </p>
            </>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {signedIn ? (
              <button type="button" onClick={disconnect} className={ghostButton}>
                Sign out
              </button>
            ) : (
              <PillButton
                onClick={connected ? signIn : connect}
                disabled={
                  status === "connecting" ||
                  status === "loading" ||
                  status === "authenticating"
                }
              >
                {status === "authenticating"
                  ? "Waiting for your wallet…"
                  : status === "connecting"
                    ? "Opening…"
                    : "Sign in"}
              </PillButton>
            )}
          </div>
        </div>

        {/* The wallet is the account: one signature from the key to
            everything keyed to it. */}
        <div className="hidden lg:block">
          <WalletFigure />
        </div>
      </div>

      {/* The second door, on the account panel. Shared with the buyer's
          profile page so both say the same thing about what Google can and
          cannot do — see components/auth/google-link.tsx. */}
      {signedIn && <GoogleLink tone="dark" />}
    </section>
  );
}
