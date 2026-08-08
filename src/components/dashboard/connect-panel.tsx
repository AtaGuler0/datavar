"use client";

import { truncateAddress } from "@/lib/stellar/config";
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
  const { address, status, session, connect, disconnect, signIn, signInError } =
    useWallet();
  const connected = status === "connected" && address;
  const signedIn = connected && !!session;

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950">
      <div className="flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
        <div className="max-w-md">
          <p className="eyebrow text-chalk-faint">
            {signedIn ? "Signed in" : connected ? "Unproved" : "Not connected"}
          </p>
          {signedIn ? (
            <>
              <p className="mt-3 text-lg text-balance text-chalk">
                Signed in as{" "}
                <span className="font-mono text-slate-soft">
                  {truncateAddress(address)}
                </span>
              </p>
              <p className="mt-2 text-sm text-pretty text-chalk-dim">
                Your sources, consent receipts and payouts are all keyed to this
                wallet. We&apos;re on testnet, so no real funds move yet.
              </p>
            </>
          ) : connected ? (
            <>
              <p className="mt-3 text-lg text-balance text-chalk">
                Connected as{" "}
                <span className="font-mono text-slate-soft">
                  {truncateAddress(address)}
                </span>
                , but not signed in yet.
              </p>
              <p className="mt-2 text-sm text-pretty text-chalk-dim">
                {signInError ??
                  "One signature proves the wallet is yours. It's a challenge transaction that can never reach the network, and nothing of yours loads until it's done."}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-lg text-balance text-chalk">
                Connect a Stellar wallet to sign in.
              </p>
              <p className="mt-2 text-sm text-pretty text-chalk-dim">
                Your wallet is your identity and where payouts land. We&apos;re
                on testnet, so no real funds move yet.
              </p>
            </>
          )}
        </div>

        {signedIn ? (
          <button
            type="button"
            onClick={disconnect}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-ink-800 bg-ink-900 px-5 py-3 text-sm font-medium text-chalk-dim transition-colors hover:border-rule-dark-strong hover:text-chalk"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={connected ? signIn : connect}
            disabled={
              status === "connecting" ||
              status === "loading" ||
              status === "authenticating"
            }
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-chalk px-5 py-3 text-sm font-medium text-ink-950 transition-colors hover:bg-paper disabled:opacity-70"
          >
            {status === "authenticating"
              ? "Waiting for your wallet…"
              : status === "connecting"
                ? "Connecting…"
                : connected
                  ? "Sign in"
                  : "Connect wallet"}
          </button>
        )}
      </div>
    </div>
  );
}
