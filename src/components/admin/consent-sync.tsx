"use client";

import { useState } from "react";
import { Card } from "@/components/dashboard/primitives";
import { authHeaders } from "@/lib/auth/session-store";

/**
 * Bringing this database's copy of the consent ledger up to date.
 *
 * Every grant and revoke made from here on mirrors itself as it lands, so this
 * is not a job that has to run — it is for the receipts that predate the
 * mirror, and for the day someone wants to prove the two still agree. It reads
 * the contract and writes what it says; there is nothing to configure.
 *
 * Batched by contributor because each one is a round trip to the ledger, and a
 * deployment with a hundred of them is a minute of them. The button walks the
 * batches itself and reports the total.
 */
export function ConsentSync() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = async () => {
    setRunning(true);
    setError(null);
    setStatus("Reading the ledger…");

    let offset = 0;
    let receipts = 0;
    let walked = 0;
    let failed = 0;

    try {
      // A ceiling on the walk, so a deployment that grows a contributor
      // between batches can't turn this into a loop with no end.
      for (let batch = 0; batch < 100; batch++) {
        const res = await fetch("/api/consent/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ offset }),
        });
        const result = await res.json().catch(() => null);
        if (!res.ok) throw new Error(result?.error ?? "The sync didn't run.");

        walked += Number(result.walked ?? 0);
        receipts += Number(result.receipts ?? 0);
        failed += Number(result.failed ?? 0);
        setStatus(
          `${walked} of ${result.contributors} contributors · ${receipts} receipts mirrored`,
        );

        if (result.next === null) break;
        offset = Number(result.next);
      }

      setStatus(
        `${receipts} receipts mirrored from ${walked} contributors.` +
          (failed > 0
            ? ` ${failed} couldn't be read from the contract — run it again.`
            : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The sync didn't run.");
      setStatus(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card
      title="Consent mirror"
      subtitle="What the catalogue filters on"
      action={
        <button
          type="button"
          onClick={sync}
          disabled={running}
          className="shrink-0 rounded-lg border border-rule-strong px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-paper-raised disabled:opacity-50"
        >
          {running ? "Syncing…" : "Sync from the contract"}
        </button>
      }
    >
      <p className="text-sm text-pretty text-ink-dim">
        A dataset is listed on the marketplace when its contributor has granted
        consent to the marketplace address. That is ledger state; this table is
        a copy of it, so the catalogue can be filtered in one query. New grants
        mirror themselves — this is for the ones made before the mirror existed.
      </p>

      {status && (
        <p className="mt-3 font-mono text-xs text-ink-dim tabular-nums">{status}</p>
      )}
      {error && <p className="mt-3 text-sm text-fall">{error}</p>}
    </Card>
  );
}
