import { supabase } from "./client";

/** Where a payout stands. See the `sales` table in schema.sql. */
export type SaleStatus = "unclaimed" | "claiming" | "claimed";

/** One dataset licensed to a buyer, and the payout owed for it. */
export type Sale = {
  id: string;
  dataset_id: string;
  owner_wallet: string;
  buyer: string;
  price_stroops: number;
  status: SaleStatus;
  tx_hash: string | null;
  claimed_at: string | null;
  created_at: string;
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

/** Sum of a set of sales, in stroops. */
export function totalStroops(sales: Sale[]): number {
  return sales.reduce((sum, s) => sum + Number(s.price_stroops), 0);
}
