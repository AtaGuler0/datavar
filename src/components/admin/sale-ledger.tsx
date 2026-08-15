"use client";

import { useMemo, useState } from "react";
import { formatCount } from "@/lib/format";
import { creditPending } from "@/lib/payouts";
import {
  PRICE_BAND,
  randomBuyer,
  randomPriceStroops,
  sample,
} from "@/lib/sales";
import { formatXlm } from "@/lib/stellar/config";
import { createSales, type SaleDraft, type SaleStatus } from "@/lib/supabase/sales";
import { Card } from "@/components/dashboard/primitives";
import { useWallet } from "@/components/dashboard/wallet-provider";
import { SalesTable } from "./sales-table";
import { marketTotals, useMarket } from "./use-market";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unclaimed", label: "Unclaimed" },
  { id: "claimed", label: "Claimed" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

/** How many datasets an unattended round licenses at once. */
const ROUND_SIZES = [1, 3, 5, 10] as const;

/**
 * The full ledger, plus the button that fills it. A sale round is the demand
 * side of the protocol standing in for itself: pick datasets at random, price
 * them in the placeholder band, and write the payouts. Everything downstream
 * of that — the claim, the payment, the hash — is real.
 */
export function SaleLedger() {
  const { datasets, sales, failed, reload } = useMarket();
  const { signTransaction } = useWallet();

  const [filter, setFilter] = useState<FilterId>("all");
  const [size, setSize] = useState<number>(3);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    if (!sales) return null;
    if (filter === "all") return sales;
    const wanted: SaleStatus[] =
      filter === "claimed" ? ["claimed"] : ["unclaimed", "claiming"];
    return sales.filter((s) => wanted.includes(s.status));
  }, [sales, filter]);

  const runRound = async () => {
    if (!datasets || running) return;
    setRunning(true);
    setNote(null);
    setError(null);
    try {
      const picked = sample(datasets, size);
      if (picked.length === 0) {
        setError("There's nothing on file to sell yet.");
        return;
      }

      const drafts: SaleDraft[] = picked.map((d) => ({
        dataset_id: d.id,
        owner_wallet: d.owner_wallet,
        buyer: randomBuyer(),
        price_stroops: randomPriceStroops(),
      }));

      const written = await createSales(drafts);
      const gross = written.reduce((sum, s) => sum + Number(s.price_stroops), 0);
      const sold = `Sold ${written.length} dataset${written.length === 1 ? "" : "s"} for ${formatXlm(gross)} XLM.`;

      // Credit in the same breath as the sale, with the same wallet that ran
      // the round. A recorded sale is still our money; only a credited one is
      // the contributor's, and leaving that to a button someone remembers to
      // press is what left contributors looking at payouts they could not take.
      try {
        const { warning } = await creditPending(signTransaction);
        setNote(
          warning
            ? `${sold} ${warning}`
            : `${sold} Their contributors can claim now.`,
        );
      } catch (e) {
        setNote(
          `${sold} It isn't in the payout contract yet — ${
            e instanceof Error ? e.message : "the credit didn't go through."
          } Credit it from the vault to make it claimable.`,
        );
      }
      await reload();
    } catch {
      setError("The round didn't go through. Nothing was recorded.");
    } finally {
      setRunning(false);
    }
  };

  if (failed) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-rule-strong bg-paper/60 px-6 py-12 text-center">
        <p className="text-sm text-ink-dim">The ledger is unavailable right now.</p>
      </div>
    );
  }

  if (!sales || !shown || !datasets) {
    return (
      <div className="mt-10 space-y-3">
        <div className="h-40 animate-pulse rounded-2xl border border-rule bg-paper-raised" />
        <div className="h-80 animate-pulse rounded-2xl border border-rule bg-paper-raised" />
      </div>
    );
  }

  const totals = marketTotals(datasets, sales);

  return (
    <div className="mt-10">
      {/* The simulation control, in the enterprise block — it's the one thing
          on this page that invents data, so it shouldn't look like the rest. */}
      <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950">
        <div className="flex flex-col gap-6 p-7 sm:flex-row sm:items-end sm:justify-between sm:p-9">
          <div className="max-w-md">
            <p className="eyebrow text-chalk-faint">Simulated demand</p>
            <p className="mt-3 text-lg text-balance text-chalk">
              Run a sale round.
            </p>
            <p className="mt-2 text-sm text-pretty text-chalk-dim">
              Licenses datasets at random to a placeholder buyer, priced between{" "}
              {PRICE_BAND.min} and {PRICE_BAND.max} XLM. Set a price yourself on
              the Datasets page.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
            <div className="flex items-center rounded-full border border-ink-800 bg-ink-900 p-0.5">
              {ROUND_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSize(n)}
                  aria-pressed={n === size}
                  className={`rounded-full px-3.5 py-1.5 font-mono text-xs tabular-nums transition-colors ${
                    n === size
                      ? "bg-chalk font-medium text-ink-950"
                      : "text-chalk-dim hover:text-chalk"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={runRound}
              disabled={running || datasets.length === 0}
              className="inline-flex items-center rounded-lg bg-chalk px-5 py-2.5 text-sm font-medium text-ink-950 transition-colors duration-200 hover:bg-paper disabled:opacity-70"
            >
              {running ? "Selling…" : `Sell ${size} at random`}
            </button>
          </div>
        </div>

        {(note || error) && (
          <p className="border-t border-ink-800 px-7 py-4 text-sm text-pretty text-chalk-dim sm:px-9">
            {note ?? error}
          </p>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Figure label="Gross sold" value={`${formatXlm(totals.gross)} XLM`} />
        <Figure label="Claimed" value={`${formatXlm(totals.claimed)} XLM`} />
        <Figure
          label="Awaiting claim"
          value={`${formatXlm(totals.outstanding)} XLM`}
        />
      </div>

      <div className="mt-3">
        <Card
          title="Sale ledger"
          subtitle={`${formatCount(shown.length)} sale${shown.length === 1 ? "" : "s"}`}
          action={
            <div className="flex shrink-0 items-center rounded-full border border-rule bg-paper p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={f.id === filter}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    f.id === filter
                      ? "bg-ink-950 text-chalk"
                      : "text-ink-dim hover:text-ink"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        >
          <SalesTable
            sales={shown}
            emptyLabel={
              sales.length === 0
                ? "Nothing sold yet. Run a round above."
                : "No sales in that state."
            }
          />
        </Card>
      </div>
    </div>
  );
}

/** A single figure on a card — lighter than a StatCard, which wants a delta. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs text-ink-dim">{label}</p>
      <p className="mt-2 text-[1.75rem] font-semibold leading-none tabular-nums text-ink">
        {value}
      </p>
    </Card>
  );
}
