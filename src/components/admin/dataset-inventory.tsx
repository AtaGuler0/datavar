"use client";

import { useMemo, useState } from "react";
import { formatBytes, formatCount, formatDate } from "@/lib/format";
import {
  PRICE_BAND,
  randomBuyer,
  randomPriceStroops,
  SIMULATED_BUYERS,
  xlmToStroops,
} from "@/lib/sales";
import {
  formatXlm,
  STROOPS_PER_XLM,
  truncateAddress,
} from "@/lib/stellar/config";
import { sourceLabel, type Dataset } from "@/lib/supabase/datasets";
import { createSales } from "@/lib/supabase/sales";
import { Card } from "@/components/dashboard/primitives";
import { useMarket } from "./use-market";

/**
 * The inventory, and the one screen where an operator sets a price by hand.
 * Selling a dataset writes a sale row at whatever price is typed — the random
 * band on the Sales page is the unattended version of this same action, and
 * both end up as a payout the contributor can claim.
 */
export function DatasetInventory() {
  const { datasets, sales, failed, reload } = useMarket();

  const [query, setQuery] = useState("");
  const [onlyUnsold, setOnlyUnsold] = useState(false);
  const [selling, setSelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // How many times each dataset has been licensed, and for how much.
  const soldIndex = useMemo(() => {
    const index = new Map<string, { count: number; gross: number }>();
    for (const sale of sales ?? []) {
      const seen = index.get(sale.dataset_id) ?? { count: 0, gross: 0 };
      index.set(sale.dataset_id, {
        count: seen.count + 1,
        gross: seen.gross + Number(sale.price_stroops),
      });
    }
    return index;
  }, [sales]);

  const rows = useMemo(() => {
    if (!datasets) return null;
    const needle = query.trim().toLowerCase();
    return datasets.filter((d) => {
      if (onlyUnsold && soldIndex.has(d.id)) return false;
      if (!needle) return true;
      return (
        d.title.toLowerCase().includes(needle) ||
        d.owner_wallet.toLowerCase().includes(needle) ||
        sourceLabel(d.source_type).toLowerCase().includes(needle)
      );
    });
  }, [datasets, query, onlyUnsold, soldIndex]);

  const sell = async (dataset: Dataset, priceXlm: number, buyer: string) => {
    setSelling(dataset.id);
    setError(null);
    try {
      await createSales([
        {
          dataset_id: dataset.id,
          owner_wallet: dataset.owner_wallet,
          buyer,
          price_stroops: xlmToStroops(priceXlm),
        },
      ]);
      await reload();
    } catch {
      setError("Couldn't record that sale. Try again.");
    } finally {
      setSelling(null);
    }
  };

  if (failed) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-rule-strong bg-paper/60 px-6 py-12 text-center">
        <p className="text-sm text-ink-dim">The inventory is unavailable right now.</p>
      </div>
    );
  }

  if (!rows || !datasets) {
    return (
      <div className="mt-10 h-96 animate-pulse rounded-2xl border border-rule bg-paper-raised" />
    );
  }

  return (
    <div className="mt-10">
      {error && (
        <p className="mb-3 rounded-xl border border-rule bg-paper px-4 py-3 text-sm text-ink-dim">
          {error}
        </p>
      )}

      <Card
        title="Inventory"
        subtitle={`${formatCount(rows.length)} of ${formatCount(datasets.length)} dataset${datasets.length === 1 ? "" : "s"}`}
        action={
          <div className="flex shrink-0 items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-dim">
              <input
                type="checkbox"
                checked={onlyUnsold}
                onChange={(e) => setOnlyUnsold(e.target.checked)}
                className="h-3.5 w-3.5 accent-slate-deep"
              />
              Unsold only
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search datasets"
              className="w-32 rounded-lg border border-rule bg-paper px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-slate/50 focus:outline-none sm:w-44"
            />
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="flex h-44 items-center justify-center rounded-xl border border-dashed border-rule-strong bg-paper-raised/50 px-6 text-center text-sm text-ink-dim">
            {datasets.length === 0
              ? "No datasets have been contributed yet."
              : "Nothing matches that filter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
                  <th className="pb-2.5 pr-4 font-normal">Dataset</th>
                  <th className="pb-2.5 pr-4 font-normal">Contributor</th>
                  <th className="pb-2.5 pr-4 text-right font-normal">Size</th>
                  <th className="pb-2.5 pr-4 text-right font-normal">Added</th>
                  <th className="pb-2.5 pr-4 text-right font-normal">Sold</th>
                  <th className="pb-2.5 text-right font-normal">Licence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((dataset) => (
                  <InventoryRow
                    key={dataset.id}
                    dataset={dataset}
                    history={soldIndex.get(dataset.id)}
                    busy={selling === dataset.id}
                    disabled={!!selling}
                    onSell={sell}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-pretty text-ink-faint">
        Selling records a payout the contributor can claim in test XLM. Buyers
        are placeholders until the buyer side of the protocol exists; the price
        is whatever you set here.
      </p>
    </div>
  );
}

/** One dataset, with its price field and the button that licenses it. */
function InventoryRow({
  dataset,
  history,
  busy,
  disabled,
  onSell,
}: {
  dataset: Dataset;
  history?: { count: number; gross: number };
  busy: boolean;
  disabled: boolean;
  onSell: (dataset: Dataset, priceXlm: number, buyer: string) => void;
}) {
  // Seeded from the band so the field is never empty — an operator who just
  // wants a sale can press the button, and one who cares can type over it.
  const [price, setPrice] = useState(() =>
    (randomPriceStroops() / STROOPS_PER_XLM).toFixed(2),
  );
  const [buyer, setBuyer] = useState(() => randomBuyer());

  const value = Number(price);
  const valid = Number.isFinite(value) && value > 0;

  return (
    <tr className="border-t border-rule">
      <td className="max-w-48 py-3 pr-4">
        <span className="block truncate font-medium text-ink">
          {dataset.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-faint">
          {sourceLabel(dataset.source_type)}
          {dataset.synthetic ? (
            // Load-testing data. Shown because pricing a dataset means knowing
            // whether anyone actually contributed it — and because a marker
            // only the database can see is not a marker.
            <span
              className="ml-1.5 rounded-sm border border-rule px-1 py-px text-[10px] tracking-wide uppercase"
              title="Generated for load testing. Excluded from public totals."
            >
              generated
            </span>
          ) : null}
        </span>
      </td>
      <td className="py-3 pr-4 font-mono text-xs tabular-nums whitespace-nowrap text-ink-dim">
        {truncateAddress(dataset.owner_wallet)}
      </td>
      <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums whitespace-nowrap text-ink-dim">
        {formatBytes(dataset.byte_size)}
      </td>
      <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums whitespace-nowrap text-ink-dim">
        {formatDate(dataset.created_at)}
      </td>
      <td className="py-3 pr-4 text-right whitespace-nowrap">
        {history ? (
          <span className="font-mono text-xs tabular-nums text-ink">
            {history.count}× · {formatXlm(history.gross)} XLM
          </span>
        ) : (
          <span className="font-mono text-xs text-ink-faint">—</span>
        )}
      </td>
      <td className="py-3 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1.5">
          <select
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
            aria-label={`Buyer for ${dataset.title}`}
            className="w-28 rounded-lg border border-rule bg-paper px-2 py-1.5 text-xs text-ink focus:border-slate/50 focus:outline-none"
          >
            {SIMULATED_BUYERS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            aria-label={`Price in XLM for ${dataset.title}`}
            title={`Placeholder band is ${PRICE_BAND.min}–${PRICE_BAND.max} XLM`}
            className="w-16 rounded-lg border border-rule bg-paper px-2 py-1.5 text-right font-mono text-xs tabular-nums text-ink focus:border-slate/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onSell(dataset, value, buyer)}
            disabled={disabled || !valid}
            className="inline-flex items-center rounded-lg bg-slate-deep px-3 py-1.5 text-xs font-medium text-paper transition-colors duration-200 hover:bg-slate disabled:opacity-50"
          >
            {busy ? "Selling…" : "Sell"}
          </button>
        </div>
      </td>
    </tr>
  );
}
