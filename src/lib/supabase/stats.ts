import { supabase } from "./client";

/**
 * The public, protocol-wide numbers the landing page quotes. Everything here
 * is counted from the two tables that actually exist — nothing is typed in by
 * hand. When the protocol has done nothing, these are zeros, and the page says
 * zero.
 *
 * Only the columns needed to count are selected: the landing page has no
 * business pulling dataset titles into every visitor's browser.
 */

/** Ceiling on rows read for the aggregates. Same posture as the network view:
 *  well above testnet volume, and the signal to move these into a Postgres
 *  view when it stops being. */
const MAX_ROWS = 10_000;

/** How many unit-chart dots the page will draw before it stops adding them. */
const MAX_UNITS = 480;

export type ProtocolStats = {
  /** Distinct wallets that have contributed at least one dataset. */
  contributors: number;
  /** Datasets contributed. */
  datasets: number;
  /** Total settled on-chain, in stroops. Claimed sales only — an unclaimed
   *  sale is money owed, not money paid. */
  paidStroops: number;
  /** Payouts that reached the ledger. */
  payouts: number;
  /** One entry per dataset for the unit chart, capped; `sold` marks the ones
   *  that have been licensed at least once. */
  units: { sold: boolean }[];
  /** True when the cap trimmed the unit chart, so the caption can say so. */
  unitsTruncated: boolean;
  /**
   * Average settled price per source category, in stroops, from real sales.
   * A category with no sales is absent — the estimator shows a dash rather
   * than inventing a rate for it.
   */
  avgStroopsBySource: Record<string, number>;
};

/** Zeros. What the page renders when there is no data, or when Supabase is
 *  unreachable — the alternative would be a made-up number, which is the
 *  thing this whole module exists to avoid. */
export const EMPTY_STATS: ProtocolStats = {
  contributors: 0,
  datasets: 0,
  paidStroops: 0,
  payouts: 0,
  units: [],
  unitsTruncated: false,
  avgStroopsBySource: {},
};

type DatasetRow = { id: string; owner_wallet: string };
type SaleRow = {
  dataset_id: string;
  price_stroops: number;
  status: string;
  datasets: { source_type: string } | null;
};

export async function loadProtocolStats(): Promise<ProtocolStats> {
  const [datasetsResult, salesResult] = await Promise.all([
    supabase
      .from("datasets")
      .select("id, owner_wallet")
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS),
    supabase
      .from("sales")
      .select("dataset_id, price_stroops, status, datasets (source_type)")
      .limit(MAX_ROWS),
  ]);

  if (datasetsResult.error) throw datasetsResult.error;

  // The two halves degrade separately on purpose. `sales` arrives later than
  // `datasets` in schema.sql, so an environment that hasn't re-run the schema
  // has contributions but no sales table — and a 404 there should cost the
  // page its payout figures, not the contributor count it can still prove.
  const datasets = (datasetsResult.data ?? []) as DatasetRow[];
  const sales = salesResult.error
    ? []
    : ((salesResult.data ?? []) as unknown as SaleRow[]);

  const claimed = sales.filter((s) => s.status === "claimed");
  const soldDatasetIds = new Set(sales.map((s) => s.dataset_id));

  // Averages come from every sale, not just claimed ones: the price is agreed
  // when the sale is made, and whether the contributor has pressed claim yet
  // says nothing about what the data was worth.
  const bySource = new Map<string, { total: number; count: number }>();
  for (const sale of sales) {
    const source = sale.datasets?.source_type;
    if (!source) continue;
    const entry = bySource.get(source) ?? { total: 0, count: 0 };
    entry.total += Number(sale.price_stroops);
    entry.count += 1;
    bySource.set(source, entry);
  }

  const avgStroopsBySource: Record<string, number> = {};
  for (const [source, { total, count }] of bySource) {
    avgStroopsBySource[source] = Math.round(total / count);
  }

  return {
    contributors: new Set(datasets.map((d) => d.owner_wallet)).size,
    datasets: datasets.length,
    paidStroops: claimed.reduce((sum, s) => sum + Number(s.price_stroops), 0),
    payouts: claimed.length,
    units: datasets
      .slice(0, MAX_UNITS)
      .map((d) => ({ sold: soldDatasetIds.has(d.id) })),
    unitsTruncated: datasets.length > MAX_UNITS,
    avgStroopsBySource,
  };
}
