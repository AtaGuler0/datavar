"use client";

import { useEffect, useState } from "react";
import { explorerTxUrl } from "@/lib/stellar/config";
import { assetLabel, isSettled } from "@/lib/anchor/sep6";
import type { AnchorTransaction } from "@/lib/anchor/types";

/**
 * Where an order is, in the anchor's own words.
 *
 * SEP-6 statuses are machine names, and a person watching their money move
 * deserves a sentence. Each one is translated rather than prettified: the
 * mapping below says what is true and, where the next move is the user's, what
 * that move is.
 */
const SAYS: Record<string, string> = {
  incomplete: "Waiting for you to finish starting it.",
  pending_user_transfer_start: "Waiting for your transfer to arrive.",
  pending_user_transfer_complete: "Your transfer is in. The anchor is working.",
  pending_external: "Moving through the banking system.",
  pending_anchor: "The anchor is processing it.",
  pending_stellar: "Paying out on Stellar now.",
  pending_trust:
    "Waiting on a trustline — the asset has nowhere to land until you add one.",
  pending_customer_info_update: "The anchor is asking for more information.",
  completed: "Done.",
  refunded: "Refunded.",
  expired: "Expired without completing.",
  error: "The anchor stopped on an error.",
};

/**
 * How long an order may sit in one state before the screen admits it is
 * stuck. Chosen from watching the real anchor: a healthy deposit moves from
 * `pending_anchor` to `completed` in seconds.
 */
const PATIENCE_MS = 90_000;

export function StatusLine({
  tx,
  hash,
  expect,
}: {
  tx: AnchorTransaction | null;
  /** The Stellar payment this side sent, on a withdrawal. */
  hash?: string | null;
  /** What should come out the other end, as the quote promised. */
  expect?: string;
}) {
  const settled = tx ? isSettled(tx.status) : false;

  // A stall is the anchor's to fix and the user's to know about. Without this
  // the screen says "the anchor is processing it" forever, which is true and
  // useless: they are left wondering whether their money is lost.
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (!tx || settled) return;
    const since = Date.now();
    const timer = setInterval(() => setWaited(Date.now() - since), 5000);
    return () => clearInterval(timer);
  }, [tx?.status, settled, tx]);

  const stalled = !settled && waited > PATIENCE_MS;

  return (
    <div className="rounded-2xl border border-rule bg-paper-raised/60 p-5">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${
            !tx
              ? "bg-rule-strong"
              : tx.status === "completed"
                ? "bg-rise"
                : settled
                  ? "bg-fall"
                  : "animate-pulse bg-slate"
          }`}
        />
        <p className="text-sm text-ink">
          {tx ? (SAYS[tx.status] ?? tx.status) : "Starting…"}
        </p>
      </div>

      {tx?.message && (
        <p className="mt-2 text-xs text-pretty text-ink-faint">{tx.message}</p>
      )}

      {stalled && (
        <p className="mt-2 text-xs text-pretty text-fall">
          It has been sitting here for {Math.round(waited / 60_000)} minute
          {Math.round(waited / 60_000) === 1 ? "" : "s"}. The order is recorded
          at the anchor and keeps its rate; this step is theirs to finish, and
          it will when their payout side catches up. Nothing here is lost, and
          nothing needs doing again.
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.8125rem]">
        {expect && <Row label="Expecting" value={expect} />}
        {tx?.amount_in && (
          <Row
            label="In"
            value={`${Number(tx.amount_in).toLocaleString("en-US")} ${assetLabel(tx.amount_in_asset)}`}
          />
        )}
        {tx?.amount_out && (
          <Row
            label="Out"
            value={`${Number(tx.amount_out).toLocaleString("en-US")} ${assetLabel(tx.amount_out_asset)}`}
          />
        )}
        {tx?.amount_fee && Number(tx.amount_fee) > 0 && (
          <Row
            label="Fee"
            value={`${Number(tx.amount_fee).toLocaleString("en-US")} ${assetLabel(tx.amount_fee_asset)}`}
          />
        )}
      </dl>

      {(hash || tx?.stellar_transaction_id) && (
        <a
          href={explorerTxUrl(hash ?? tx?.stellar_transaction_id ?? "")}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block break-all font-mono text-[0.6875rem] text-slate underline-offset-4 hover:underline"
        >
          {(hash ?? tx?.stellar_transaction_id ?? "").slice(0, 24)}…
        </a>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] text-ink-faint">{label}</dt>
      <dd className="truncate text-ink-dim tabular-nums">{value}</dd>
    </div>
  );
}
