"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/auth/session-store";
import { formatBytes, formatCount, formatDate } from "@/lib/format";
import {
  buildLifecycles,
  lifecycleTotals,
  type DatasetLifecycle,
} from "@/lib/lifecycle";
import { formatXlm, truncateAddress } from "@/lib/stellar/config";
import type { ConsentReceipt } from "@/lib/stellar/consent";
import {
  listDatasets,
  sourceLabel,
  type Dataset,
} from "@/lib/supabase/datasets";
import { listSalesForWallet, type Sale } from "@/lib/supabase/sales";
import { ConsentGrantForm } from "./consent-grant-form";
import { LifecycleStrip } from "./lifecycle-strip";
import { Card } from "./primitives";
import { UploadCard } from "./upload-flow";
import { useWallet } from "./wallet-provider";

/**
 * Everything a contributor has given the protocol, on one page.
 *
 * This replaces two sections that were never really separate. Uploading a file
 * and granting consent for it were different screens, so the product asked you
 * to hold the connection between them in your head — and the thing that
 * actually blocks earnings, a dataset nobody may license, was invisible from
 * both. Here each dataset carries its own state and its own next move.
 */
export function DataPanel() {
  const { address } = useWallet();

  const [loaded, setLoaded] = useState<{
    wallet: string;
    datasets: Dataset[];
    receipts: ConsentReceipt[];
    sales: Sale[];
  } | null>(null);
  const [failed, setFailed] = useState(false);
  /** The contract can be unreachable while the rest of the page is fine. */
  const [consentDown, setConsentDown] = useState(false);

  const read = useCallback(async (wallet: string) => {
    const [datasets, sales, receipts] = await Promise.all([
      listDatasets(wallet),
      listSalesForWallet(wallet),
      // Consent degrades on its own: it is a ledger read over the network, and
      // losing it should cost the page its consent column, not the file list.
      fetch(`/api/consent?wallet=${wallet}`)
        .then(async (res) => {
          if (!res.ok) throw new Error();
          return ((await res.json()).receipts ?? []) as ConsentReceipt[];
        })
        .catch(() => {
          setConsentDown(true);
          return [] as ConsentReceipt[];
        }),
    ]);
    return { wallet, datasets, receipts, sales };
  }, []);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    read(address)
      .then((state) => !cancelled && setLoaded(state))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [address, read]);

  const refresh = useCallback(() => {
    if (!address) return;
    setConsentDown(false);
    read(address)
      .then(setLoaded)
      .catch(() => setFailed(true));
  }, [address, read]);

  // A fresh upload shows up immediately, with no consent and no sales — which
  // is exactly its true state, so there is nothing to refetch for.
  const onUploaded = useCallback((dataset: Dataset) => {
    setLoaded((prev) =>
      prev ? { ...prev, datasets: [dataset, ...prev.datasets] } : prev,
    );
  }, []);

  const state = address && loaded?.wallet === address ? loaded : null;

  const items = useMemo(
    () =>
      state ? buildLifecycles(state.datasets, state.receipts, state.sales) : null,
    [state],
  );

  if (failed) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-rule-strong bg-paper/60 px-6 py-12 text-center">
        <p className="text-sm text-ink-dim">Your data is unavailable right now.</p>
      </div>
    );
  }

  if (!items) {
    return (
      <div className="mt-10 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-rule bg-paper-raised"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl border border-rule bg-paper-raised" />
      </div>
    );
  }

  const totals = lifecycleTotals(items);

  return (
    <div className="mt-10 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          label="Datasets"
          value={formatCount(totals.datasets)}
          note={formatBytes(totals.bytes)}
        />
        <Figure
          label="Awaiting consent"
          value={formatCount(totals.awaitingConsent)}
          note={
            totals.awaitingConsent === 0
              ? "everything is licensable"
              : "nobody may license these yet"
          }
        />
        <Figure
          label="Licensed"
          value={formatCount(totals.licensed)}
          note={`${formatXlm(totals.grossStroops)} XLM gross`}
        />
        <Figure
          label="Ready to claim"
          value={`${formatXlm(totals.claimableStroops)} XLM`}
          note={totals.claimableStroops === 0 ? "nothing waiting" : "yours to take"}
        />
      </div>

      <UploadCard onUploaded={onUploaded} />

      {consentDown && (
        <p className="rounded-xl border border-rule bg-paper px-4 py-3 text-sm text-ink-dim">
          The consent contract didn&apos;t answer, so receipts aren&apos;t shown
          below. Your files and payouts are unaffected.
        </p>
      )}

      <Card
        title="Your data"
        subtitle="Each dataset, how far it has got, and what it needs next"
        action={
          <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
            {truncateAddress(address ?? "")}
          </span>
        }
      >
        {items.length === 0 ? (
          <p className="flex h-40 items-center justify-center rounded-xl border border-dashed border-rule-strong bg-paper-raised/50 px-6 text-center text-sm text-ink-dim">
            Nothing yet. Contribute a dataset above and it starts its life here.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => (
              <LifecycleRow
                key={item.dataset.id}
                item={item}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </Card>

      <ConnectedSources />
    </div>
  );
}

/** A single figure. Lighter than StatCard, which wants a delta to earn its space. */
function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card>
      <p className="text-xs text-ink-dim">{label}</p>
      <p className="mt-2 text-[1.5rem] font-semibold leading-none tabular-nums text-ink">
        {value}
      </p>
      <p className="mt-2.5 text-xs text-ink-faint">{note}</p>
    </Card>
  );
}

/**
 * One dataset, from file to payout. The strip says where it got to; the line
 * under it says what that means, and carries the one action worth offering.
 */
function LifecycleRow({
  item,
  onChanged,
}: {
  item: DatasetLifecycle;
  onChanged: () => void;
}) {
  const { address } = useWallet();
  const [granting, setGranting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { dataset, activeReceipts, unclaimedSales } = item;
  // Oldest first: a payout that has waited longest goes first.
  const nextSale = unclaimedSales[unclaimedSales.length - 1];

  const claim = async () => {
    if (!address || !nextSale || claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        // The claim route reads the wallet from the session, not the body —
        // without the header it is an anonymous request and rightly refused.
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ saleId: nextSale.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "The payout didn't go through.");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payout didn't go through.");
    } finally {
      setClaiming(false);
    }
  };

  return (
    // Anchored so the consent and earnings ledgers can point back at the exact
    // dataset a row is about. scroll-mt clears the dashboard's sticky top bar,
    // or the heading lands underneath it.
    <li
      id={`dataset-${dataset.id}`}
      className="scroll-mt-24 rounded-xl border border-rule bg-paper p-4 shadow-sm shadow-ink/[0.03] target:border-slate/50 target:ring-2 target:ring-slate/15 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{dataset.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.6875rem] text-ink-faint">
            <span className="rounded border border-rule bg-paper-raised/60 px-1.5 py-0.5">
              {sourceLabel(dataset.source_type)}
            </span>
            <span>{formatBytes(dataset.byte_size)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDate(dataset.created_at)}</span>
          </p>
        </div>
        {item.grossStroops > 0 && (
          <p className="shrink-0 font-mono text-xs tabular-nums text-ink-dim">
            {formatXlm(item.grossStroops)} XLM earned
          </p>
        )}
      </div>

      <div className="mt-4">
        <LifecycleStrip reached={item.reached} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-rule pt-3.5">
        <StatusLine item={item} />

        {item.next === "claim" && nextSale && (
          <button
            type="button"
            onClick={claim}
            disabled={claiming}
            className="inline-flex shrink-0 items-center rounded-lg bg-slate-deep px-3.5 py-1.5 text-xs font-medium text-paper transition-colors duration-200 hover:bg-slate disabled:opacity-50"
          >
            {claiming
              ? "Settling…"
              : `Claim ${formatXlm(Number(nextSale.price_stroops))} XLM`}
          </button>
        )}

        {item.next === "grant" && (
          <button
            type="button"
            onClick={() => setGranting((open) => !open)}
            aria-expanded={granting}
            className="inline-flex shrink-0 items-center rounded-lg bg-slate-deep px-3.5 py-1.5 text-xs font-medium text-paper transition-colors duration-200 hover:bg-slate"
          >
            {granting ? "Cancel" : "Grant consent"}
          </button>
        )}

        {item.next === null && activeReceipts.length > 0 && (
          <button
            type="button"
            onClick={() => setGranting((open) => !open)}
            aria-expanded={granting}
            className="inline-flex shrink-0 items-center rounded-lg border border-rule-strong px-3.5 py-1.5 text-xs font-medium text-ink transition-colors duration-200 hover:bg-paper-raised"
          >
            {granting ? "Cancel" : "Grant another"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-rule bg-paper-raised/60 px-3.5 py-2.5 text-sm text-ink-dim">
          {error}
        </p>
      )}

      {/* The grant form, in the row it belongs to. The dataset is already
          decided — that was the whole gap between these two screens. */}
      {granting && (
        <div className="mt-4 rounded-xl border border-rule bg-paper-raised/40 p-4">
          <p className="mb-3 text-xs font-medium text-ink">
            Grant consent for this dataset
          </p>
          <ConsentGrantForm
            bare
            fixed={dataset}
            onGranted={() => {
              setGranting(false);
              onChanged();
            }}
          />
        </div>
      )}
    </li>
  );
}

/** What the strip means, in a sentence, for whichever state this row is in. */
function StatusLine({ item }: { item: DatasetLifecycle }) {
  const { activeReceipts, unclaimedSales, claimedSales } = item;

  if (unclaimedSales.length > 0) {
    const sale = unclaimedSales[unclaimedSales.length - 1];
    return (
      <p className="text-xs text-pretty text-ink-dim">
        Licensed to {sale.buyer}
        {unclaimedSales.length > 1 && (
          <> · {unclaimedSales.length} payouts waiting</>
        )}
      </p>
    );
  }

  if (activeReceipts.length === 0) {
    return (
      <p className="text-xs text-pretty text-ink-dim">
        {item.receipts.length === 0
          ? "No consent yet — nobody may license this."
          : "Consent has ended. Grant again to make it licensable."}
      </p>
    );
  }

  // Standing consent: the soonest expiry is the one that matters.
  const soonest = activeReceipts.reduce((a, b) =>
    a.expiresAt <= b.expiresAt ? a : b,
  );

  return (
    <p className="text-xs text-pretty text-ink-dim">
      Consent standing with {activeReceipts.length} buyer
      {activeReceipts.length === 1 ? "" : "s"} · until{" "}
      {formatDate(new Date(soonest.expiresAt * 1000).toISOString())}
      {claimedSales.length > 0 && <> · all payouts claimed</>}
    </p>
  );
}

/**
 * The other way data was meant to arrive. Still not built, and still said
 * plainly rather than dressed as an empty state waiting to be filled.
 */
function ConnectedSources() {
  return (
    <Card
      title="Connected sources"
      subtitle="Accounts and devices that produce data continuously"
    >
      <div className="rounded-xl border border-dashed border-rule-strong bg-paper-raised/50 px-6 py-10 text-center">
        <p className="text-sm text-pretty text-ink-dim">
          Linking browsing, health, purchases and media directly isn&apos;t
          wired up yet.
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-pretty text-ink-faint">
          Direct uploads are how data enters the protocol today. Each connected
          source will arrive behind its own consent, like everything above.
        </p>
      </div>
    </Card>
  );
}
