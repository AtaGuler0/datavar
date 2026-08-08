"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import {
  CONSENT_CONTRACT_ID,
  explorerContractUrl,
  truncateAddress,
} from "@/lib/stellar/config";
import type { ConsentReceipt, ReceiptStatus } from "@/lib/stellar/consent";
import { ConsentGrantForm } from "./consent-grant-form";
import { Card } from "./primitives";
import { StatCard } from "./stat-card";
import { useWallet } from "./wallet-provider";

/**
 * The consent ledger. Every row here is contract state on Stellar testnet, not
 * a row in our database — which is the only reason the page is worth anything:
 * a buyer can check the same receipt without our permission, and revoking one
 * ends it in a place we cannot quietly edit.
 */
export function ConsentPanel() {
  const { address, signTransaction } = useWallet();

  const [loaded, setLoaded] = useState<{
    wallet: string;
    receipts: ConsentReceipt[];
  } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (wallet: string) => {
    const res = await fetch(`/api/consent?wallet=${wallet}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error ?? "Couldn't read your receipts.");
    return body.receipts as ConsentReceipt[];
  }, []);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    load(address)
      .then((receipts) => {
        if (cancelled) return;
        setLoaded({ wallet: address, receipts });
        setFailed(null);
      })
      .catch((e) => !cancelled && setFailed(e.message));
    return () => {
      cancelled = true;
    };
  }, [address, load]);

  const refresh = useCallback(() => {
    if (!address) return;
    load(address)
      .then((receipts) => setLoaded({ wallet: address, receipts }))
      .catch((e) => setError(e.message));
  }, [address, load]);

  // Keyed by wallet, like the rest of the dashboard — a switched account never
  // shows the previous one's receipts while the new ones load.
  const receipts =
    address && loaded?.wallet === address ? loaded.receipts : null;

  const totals = useMemo(() => {
    if (!receipts) return null;
    return {
      active: receipts.filter((r) => r.status === "active").length,
      revoked: receipts.filter((r) => r.status === "revoked").length,
      buyers: new Set(
        receipts.filter((r) => r.status === "active").map((r) => r.buyer),
      ).size,
    };
  }, [receipts]);

  const revoke = async (receipt: ConsentReceipt) => {
    if (!address || revoking) return;
    setRevoking(receipt.id);
    setError(null);
    try {
      const prepared = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke",
          contributor: address,
          receiptId: receipt.id,
        }),
      });
      const built = await prepared.json();
      if (!prepared.ok) throw new Error(built?.error ?? "Couldn't prepare it.");

      const signed = await signTransaction(built.xdr);

      const sent = await fetch("/api/consent/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xdr: signed }),
      });
      const result = await sent.json();
      if (!sent.ok) throw new Error(result?.error ?? "The revocation didn't land.");

      refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(
        /reject|denied|declin|cancel/i.test(message)
          ? "You declined the signature. The consent still stands."
          : message || "The revocation didn't land.",
      );
    } finally {
      setRevoking(null);
    }
  };

  if (failed) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-rule-strong bg-paper/60 px-6 py-12 text-center">
        <p className="text-sm text-ink-dim">{failed}</p>
      </div>
    );
  }

  if (!receipts || !totals) {
    return (
      <div className="mt-10 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-rule bg-paper-raised"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-rule bg-paper-raised" />
      </div>
    );
  }

  return (
    <div className="mt-10">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Consent standing"
          value={String(totals.active)}
          footnote={
            totals.active === 0
              ? "nothing granted yet"
              : "receipts a buyer can act on right now"
          }
        />
        <StatCard
          label="Withdrawn"
          value={String(totals.revoked)}
          footnote="revoked on-chain, kept on the record"
        />
        <StatCard
          label="Buyers"
          value={String(totals.buyers)}
          footnote="teams currently holding your consent"
        />
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-rule bg-paper px-4 py-3 text-sm text-ink-dim">
          {error}
        </p>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card
          title="Receipts"
          subtitle="What you've allowed, to whom, and until when"
          action={
            <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
              {truncateAddress(address ?? "")}
            </span>
          }
        >
          {receipts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-rule-strong bg-paper-raised/50 px-6 py-12 text-center">
              <p className="text-sm text-ink-dim">
                No consent granted yet. Sign one and it appears here — and on the
                ledger — at the same moment.
              </p>
            </div>
          ) : (
            <ReceiptTable
              receipts={receipts}
              revokingId={revoking}
              busy={!!revoking}
              onRevoke={revoke}
            />
          )}
        </Card>

        <ConsentGrantForm onGranted={refresh} />
      </div>

      {CONSENT_CONTRACT_ID && (
        <p className="mt-4 text-xs text-pretty text-ink-faint">
          Every receipt above is state in{" "}
          <a
            href={explorerContractUrl(CONSENT_CONTRACT_ID)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-ink-dim underline decoration-rule-strong underline-offset-2 transition-colors hover:text-ink"
          >
            {truncateAddress(CONSENT_CONTRACT_ID, 6, 6)}
          </a>{" "}
          on Stellar testnet. Anyone can call <code>is_valid</code> on it and get
          the same answer you see here, without asking us.
        </p>
      )}
    </div>
  );
}

function ReceiptTable({
  receipts,
  revokingId,
  busy,
  onRevoke,
}: {
  receipts: ConsentReceipt[];
  revokingId: string | null;
  busy: boolean;
  onRevoke: (receipt: ConsentReceipt) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
            <th className="pb-2.5 pr-4 font-normal">Purpose</th>
            <th className="pb-2.5 pr-4 font-normal">Buyer</th>
            <th className="pb-2.5 pr-4 font-normal">Dataset</th>
            <th className="pb-2.5 pr-4 text-right font-normal">Ends</th>
            <th className="pb-2.5 text-right font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {receipts.map((receipt) => (
            <tr key={receipt.id} className="border-t border-rule">
              <td className="max-w-56 py-3 pr-4">
                <span className="block truncate font-medium text-ink">
                  {receipt.purpose}
                </span>
                <span className="mt-0.5 block text-xs text-ink-faint">
                  granted {formatDate(isoOf(receipt.grantedAt))}
                </span>
              </td>
              <td
                className="py-3 pr-4 font-mono text-xs whitespace-nowrap text-ink-dim"
                title={receipt.buyer}
              >
                {truncateAddress(receipt.buyer, 4, 4)}
              </td>
              <td
                className="py-3 pr-4 font-mono text-xs whitespace-nowrap text-ink-dim"
                title={`sha256 ${receipt.datasetHash}`}
              >
                {receipt.datasetHash.slice(0, 10)}…
              </td>
              <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums whitespace-nowrap text-ink-dim">
                {formatDate(isoOf(receipt.expiresAt))}
              </td>
              <td className="py-3 text-right whitespace-nowrap">
                <StatusCell
                  receipt={receipt}
                  revoking={revokingId === receipt.id}
                  disabled={busy}
                  onRevoke={onRevoke}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A standing receipt offers the only action on this page. An ended one — by
 * withdrawal or by expiry — says which, because the difference matters to both
 * sides afterwards.
 */
function StatusCell({
  receipt,
  revoking,
  disabled,
  onRevoke,
}: {
  receipt: ConsentReceipt;
  revoking: boolean;
  disabled: boolean;
  onRevoke: (receipt: ConsentReceipt) => void;
}) {
  if (revoking) {
    return (
      <span className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-faint">
        Revoking…
      </span>
    );
  }

  if (receipt.status === "active") {
    return (
      <button
        type="button"
        onClick={() => onRevoke(receipt)}
        disabled={disabled}
        className="inline-flex items-center rounded-lg border border-rule-strong px-3.5 py-1.5 text-xs font-medium text-ink transition-colors duration-200 hover:bg-paper-raised disabled:opacity-50"
      >
        Revoke
      </button>
    );
  }

  return <StatusTag status={receipt.status} at={receipt.revokedAt} />;
}

function StatusTag({
  status,
  at,
}: {
  status: ReceiptStatus;
  at: number | null;
}) {
  const label = status === "revoked" ? "Revoked" : "Expired";
  return (
    <span
      className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-faint"
      title={at ? `on ${formatDate(isoOf(at))}` : undefined}
    >
      {label}
    </span>
  );
}

/** Contract timestamps are unix seconds; formatDate speaks ISO. */
function isoOf(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}
