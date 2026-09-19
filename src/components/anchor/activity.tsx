"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { explorerTxUrl } from "@/lib/stellar/config";
import { assetLabel, fetchTransactions } from "@/lib/anchor/sep6";
import type { AnchorSession, AnchorTransaction } from "@/lib/anchor/types";
import { said } from "./ramp";

/**
 * Everything this wallet has ever ramped, as the anchor remembers it.
 *
 * Read from the anchor rather than from our database, and that is the point:
 * datavar records none of this. A deposit is between the user, their bank and
 * the anchor, and the only thing that crosses into this product is the USDC
 * that comes out the other end.
 */
export function Activity({ session }: { session: AnchorSession }) {
  const [rows, setRows] = useState<AnchorTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchTransactions(session.token)
      .then((next) => live && setRows(next))
      .catch((e) => live && setError(said(e)));
    return () => {
      live = false;
    };
  }, [session.token]);

  if (error) {
    return <p className="text-sm text-pretty text-fall">{error}</p>;
  }

  if (rows === null) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl border border-rule bg-paper"
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-rule-strong bg-paper/60 px-6 py-12 text-center text-sm text-pretty text-ink-faint">
        Nothing yet. A deposit or a withdrawal will appear here the moment it
        starts.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((tx) => (
        <li
          key={tx.id}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-rule bg-paper px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-sm text-ink">
              {tx.kind === "deposit" ? "Deposit" : "Withdrawal"}
              <span className="mx-2 text-ink-faint">·</span>
              <span className="tabular-nums text-ink-dim">
                {tx.amount_in
                  ? `${Number(tx.amount_in).toLocaleString("en-US")} ${assetLabel(tx.amount_in_asset)}`
                  : "—"}
              </span>
              {tx.amount_out && (
                <>
                  <span className="mx-2 text-ink-faint">→</span>
                  <span className="tabular-nums text-ink-dim">
                    {Number(tx.amount_out).toLocaleString("en-US")}{" "}
                    {assetLabel(tx.amount_out_asset)}
                  </span>
                </>
              )}
            </p>
            <p className="mt-0.5 font-mono text-[0.625rem] text-ink-faint">
              {tx.started_at ? formatDate(tx.started_at) : ""}
              <span className="mx-1.5">·</span>
              {tx.status}
            </p>
          </div>

          {tx.stellar_transaction_id && (
            <a
              href={explorerTxUrl(tx.stellar_transaction_id)}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 font-mono text-[0.625rem] text-slate underline-offset-4 hover:underline"
            >
              {tx.stellar_transaction_id.slice(0, 10)}…
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
