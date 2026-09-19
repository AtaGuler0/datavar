"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addMoney,
  emptyMoney,
  PAY_ASSETS,
  type Money,
} from "@/lib/stellar/config";
import { listAllDatasets, type Dataset } from "@/lib/supabase/datasets";
import {
  listAllSales,
  totalStroops,
  type SaleWithDataset,
} from "@/lib/supabase/sales";

/**
 * The whole market in one hook: every dataset on the protocol and every sale
 * against it. All three admin pages read the same two tables, and a sale round
 * on one changes the numbers on the others, so they share a loader rather than
 * each holding their own half-stale copy.
 */
export function useMarket() {
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [sales, setSales] = useState<SaleWithDataset[] | null>(null);
  const [failed, setFailed] = useState(false);

  /** Re-read both tables after an admin action changes them. */
  const reload = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([listAllDatasets(), listAllSales()]);
      setDatasets(d);
      setSales(s);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAllDatasets(), listAllSales()])
      .then(([d, s]) => {
        if (cancelled) return;
        setDatasets(d);
        setSales(s);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return { datasets, sales, failed, reload };
}

/** Sales added up by the asset they were paid in. */
function money(sales: { asset?: "XLM" | "USDC"; price_stroops: number }[]): Money {
  return sales.reduce(
    (total, sale) =>
      addMoney(total, sale.asset ?? "XLM", Number(sale.price_stroops)),
    emptyMoney(),
  );
}

/** The standing totals every admin page quotes, derived in one place. */
export function marketTotals(datasets: Dataset[], sales: SaleWithDataset[]) {
  const unclaimed = sales.filter((s) => s.status !== "claimed");
  const claimed = sales.filter((s) => s.status === "claimed");
  // Sold, but not yet written into the payout contract — the operator's queue.
  const pending = unclaimed.filter((s) => !s.credited_at);

  // Per asset, because each queue is credited against its own vault and each
  // total is money in a different currency. `perAsset` is what the vault cards
  // read; the flat figures below are what the pages that only ever showed one
  // number still read, and they are now money objects rather than integers.
  const perAsset = PAY_ASSETS.map((asset) => {
    const mine = sales.filter((s) => (s.asset ?? "XLM") === asset);
    const queue = pending.filter((s) => (s.asset ?? "XLM") === asset);
    return {
      asset,
      pending: queue.length,
      pendingStroops: totalStroops(queue),
      sales: mine.length,
    };
  });

  return {
    perAsset,
    pending: pending.length,
    datasets: datasets.length,
    contributors: new Set(datasets.map((d) => d.owner_wallet)).size,
    sold: new Set(sales.map((s) => s.dataset_id)).size,
    sales: sales.length,
    gross: money(sales),
    claimed: money(claimed),
    outstanding: money(unclaimed),
    paidContributors: new Set(claimed.map((s) => s.owner_wallet)).size,
  };
}
