"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { truncateAddress } from "@/lib/stellar/config";
import { useWallet } from "@/components/dashboard/wallet-provider";

/**
 * Gates the admin panel on the signed-in wallet being an operator.
 *
 * The allowlist used to live in a NEXT_PUBLIC_ variable this component read
 * for itself, which meant the gate was a rendering decision — and the panel's
 * queries went out with the same anon key as everyone else's. Now the list is
 * server-side, the answer arrives inside a signed token, and row-level
 * security checks the same claim again on every query. This component only
 * decides what to draw; it is not what keeps anyone out.
 *
 * The states are all worth distinguishing: nobody connected, connected but
 * unproved, signed in as someone who isn't an operator, and nobody configured
 * as an operator at all — the last is a deployment mistake, not a permission
 * problem, and saying "denied" would send whoever hit it looking in the wrong
 * place.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { address, status, session, connect, signIn, signInError } = useWallet();

  if (status === "loading" || status === "authenticating") {
    return (
      <div className="mt-10 h-40 animate-pulse rounded-2xl border border-rule bg-paper-raised" />
    );
  }

  // The deployment problem comes before the permission one: telling someone to
  // connect a wallet that could never be accepted wastes their time. We only
  // learn this once a session exists, because the list is server-side now.
  if (session?.adminListEmpty) {
    return (
      <Notice
        eyebrow="Not configured"
        title="No operators have been named."
        body="Set ADMIN_WALLETS to a comma-separated list of Stellar addresses and restart the app. Until then nobody can get in — including you."
      />
    );
  }

  if (address && !session) {
    return (
      <Notice
        eyebrow="Unproved"
        title="Connected, but not signed in."
        body={
          signInError ??
          "Operator access needs a signature, not just a connected wallet. One challenge transaction, which can never reach the network."
        }
        action={
          <button
            type="button"
            onClick={signIn}
            className="inline-flex items-center rounded-lg bg-chalk px-5 py-2.5 text-sm font-medium text-ink-950 transition-colors duration-200 hover:bg-paper"
          >
            Sign in
          </button>
        }
      />
    );
  }

  if (!address) {
    return (
      <Notice
        eyebrow="Restricted"
        title="Operator access only."
        body="The admin panel is keyed to a wallet on the allowlist. Connect one to continue."
        action={
          <button
            type="button"
            onClick={connect}
            disabled={status === "connecting"}
            className="inline-flex items-center rounded-lg bg-chalk px-5 py-2.5 text-sm font-medium text-ink-950 transition-colors duration-200 hover:bg-paper disabled:opacity-70"
          >
            {status === "connecting" ? "Connecting…" : "Connect wallet"}
          </button>
        }
      />
    );
  }

  if (!session?.admin) {
    return (
      <Notice
        eyebrow="Not an operator"
        title="This wallet isn't on the allowlist."
        body={`Signed in as ${truncateAddress(address)}. Switch to an operator wallet, or head back to your contributor dashboard.`}
        action={
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-lg border border-ink-800 bg-ink-900 px-5 py-2.5 text-sm font-medium text-chalk-dim transition-colors hover:border-rule-dark-strong hover:text-chalk"
          >
            Go to dashboard
          </Link>
        }
      />
    );
  }

  return <>{children}</>;
}

/**
 * The enterprise block, doing gate duty. Dark on a light shell reads as a
 * closed door in a way another paper card wouldn't.
 */
function Notice({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="mt-10 overflow-hidden rounded-2xl border border-ink-800 bg-ink-950">
      <div className="flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
        <div className="max-w-md">
          <p className="eyebrow text-chalk-faint">{eyebrow}</p>
          <p className="mt-3 text-lg text-balance text-chalk">{title}</p>
          <p className="mt-2 text-sm text-pretty text-chalk-dim">{body}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
