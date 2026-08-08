import { supabase } from "./client";

/**
 * The public, protocol-wide numbers the landing page quotes. Everything here
 * is counted from the two tables that actually exist — nothing is typed in by
 * hand. When the protocol has done nothing, these are zeros, and the page says
 * zero.
 *
 * These read the aggregate views rather than the tables. Row-level security
 * puts the tables out of reach without a session, and rightly so: a landing
 * page has no business pulling anyone's dataset rows into a visitor's browser
 * to count them. Postgres does the counting; four numbers come back.
 */

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

type TotalsRow = {
  contributors: number;
  datasets: number;
  paid_stroops: number;
  payouts: number;
};

type RateRow = { source_type: string; avg_price_stroops: number };

type UnitRow = { sold: boolean };

export async function loadProtocolStats(): Promise<ProtocolStats> {
  const [totalsResult, ratesResult, unitsResult] = await Promise.all([
    supabase.from("protocol_totals").select("*").maybeSingle(),
    supabase.from("source_rates").select("source_type, avg_price_stroops"),
    supabase
      .from("network_activity")
      .select("sold")
      .order("created_at", { ascending: true })
      .limit(MAX_UNITS),
  ]);

  if (totalsResult.error) throw totalsResult.error;

  const totals = (totalsResult.data ?? null) as TotalsRow | null;
  if (!totals) return EMPTY_STATS;

  // The three degrade separately on purpose: a deployment that hasn't re-run
  // schema.sql may have one view and not the others, and a missing rate table
  // should cost the page its estimator, not the contributor count it can prove.
  const rates = ratesResult.error ? [] : ((ratesResult.data ?? []) as RateRow[]);
  const units = unitsResult.error ? [] : ((unitsResult.data ?? []) as UnitRow[]);

  const avgStroopsBySource: Record<string, number> = {};
  for (const rate of rates) {
    avgStroopsBySource[rate.source_type] = Number(rate.avg_price_stroops);
  }

  return {
    contributors: Number(totals.contributors),
    datasets: Number(totals.datasets),
    paidStroops: Number(totals.paid_stroops),
    payouts: Number(totals.payouts),
    units: units.map((u) => ({ sold: u.sold })),
    unitsTruncated: Number(totals.datasets) > MAX_UNITS,
    avgStroopsBySource,
  };
}
