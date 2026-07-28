import { supabase } from "./client";

/**
 * A contribution as the network sees it: who, what kind, how big, when. No
 * titles, descriptions or storage paths — the protocol-wide view never needs
 * to know what's inside anyone's dataset, only that it exists.
 */
export type NetworkRow = {
  owner_wallet: string;
  source_type: string;
  byte_size: number;
  created_at: string;
};

/**
 * Ceiling on rows pulled into the browser for the network view. Well above
 * the testnet's real volume; when the table outgrows it, these aggregates
 * move server-side (a Postgres view) rather than paging here.
 */
const MAX_ROWS = 10_000;

/** Every contribution on the protocol, newest first. */
export async function listNetworkDatasets(): Promise<NetworkRow[]> {
  const { data, error } = await supabase
    .from("datasets")
    .select("owner_wallet, source_type, byte_size, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) throw error;
  return (data ?? []) as NetworkRow[];
}
