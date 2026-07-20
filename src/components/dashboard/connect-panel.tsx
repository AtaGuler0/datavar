"use client";

import { truncateAddress } from "@/lib/stellar/config";
import { useWallet } from "./wallet-provider";

/**
 * The enterprise block from the landing page, reused as the account state on
 * the overview. Disconnected → the one thing standing between you and your
 * data. Connected → confirmation of which wallet you're signed in as.
 */
export function ConnectPanel() {
  const { address, status, connect, disconnect } = useWallet();
  const connected = status === "connected" && address;

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950">
      <div className="flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
        <div className="max-w-md">
          <p className="eyebrow text-chalk-faint">
            {connected ? "Connected" : "Not connected"}
          </p>
          {connected ? (
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

        {connected ? (
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
            onClick={connect}
            disabled={status === "connecting" || status === "loading"}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-chalk px-5 py-3 text-sm font-medium text-ink-950 transition-colors hover:bg-paper disabled:opacity-70"
          >
            {status === "connecting" ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </div>
    </div>
  );
}
