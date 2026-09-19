import { supabase } from "./client";

/** Where a payout stands. See the `sales` table in schema.sql. */
export type SaleStatus = "unclaimed" | "claiming" | "claimed";

/** One dataset licensed to a buyer, and the payout owed for it. */
export type Sale = {
  id: string;
  dataset_id: string;
  owner_wallet: string;
  buyer: string;
  /** The amount, in the units of `asset` — both have seven decimals. */
  price_stroops: number;
  /** What it was paid in. Rows filed before the second vault are all XLM. */
  asset: "XLM" | "USDC";
  status: SaleStatus;
  tx_hash: string | null;
  claimed_at: string | null;
  /** When the operator wrote this sale into the payout contract. Until then the
   *  money is still ours; after it, the contributor can claim it regardless. */
  credited_at: string | null;
  /** The transaction that credited it — public, like every other hash here. */
  credit_tx: string | null;
  created_at: string;
  /**
   * Where the sale came from: `operator` for a recorded round, `market` for a
   * buyer who paid for it themselves. Everything below is null on the first.
   */
  channel: "operator" | "market";
  /** The address that paid, as opposed to `buyer`, which is what they call
   *  themselves. */
  buyer_wallet: string | null;
  purpose: string | null;
  licence_expires_at: string | null;
  /** The buyer's payment into the payout vault. */
  fund_tx: string | null;
  /** The consent receipt the licence stands on. */
  consent_receipt_id: number | null;
};

/** A sale with the dataset it sold, for rows that need a title to show. */
export type SaleWithDataset = Sale & {
  datasets: { title: string; source_type: string } | null;
};

/** The embed used everywhere a sale is listed with what it sold. */
const WITH_DATASET = "*, datasets (title, source_type)";

/**
 * Ceiling on rows pulled into the browser. Same posture as the network view:
 * far above testnet volume, and the signal to move aggregates into Postgres
 * when it stops being.
 */
const MAX_ROWS = 5_000;

/** Sales of a wallet's datasets, newest first. */
export async function listSalesForWallet(
  wallet: string,
): Promise<SaleWithDataset[]> {
  const { data, error } = await supabase
    .from("sales")
    .select(WITH_DATASET)
    .eq("owner_wallet", wallet)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as SaleWithDataset[];
}

/** Every sale on the protocol, newest first. The admin ledger. */
export async function listAllSales(): Promise<SaleWithDataset[]> {
  const { data, error } = await supabase
    .from("sales")
    .select(WITH_DATASET)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) throw error;
  return (data ?? []) as unknown as SaleWithDataset[];
}

/** What a sale round writes: one row per dataset sold. */
export type SaleDraft = {
  dataset_id: string;
  owner_wallet: string;
  buyer: string;
  price_stroops: number;
};

/** Records simulated sales. Returns the rows as written, newest first. */
export async function createSales(drafts: SaleDraft[]): Promise<Sale[]> {
  if (drafts.length === 0) return [];

  const { data, error } = await supabase.from("sales").insert(drafts).select();
  if (error) throw error;
  return (data ?? []) as Sale[];
}

/**
 * Adds up a list of sales. The caller has to have narrowed them to one asset
 * first — this cannot check, and a total across two currencies is a number
 * with no unit. Every call site groups by `asset` before reaching here.
 */
export function totalStroops(sales: Sale[]): number {
  return sales.reduce((sum, s) => sum + Number(s.price_stroops), 0);
}
