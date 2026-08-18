import { supabase } from "./client";

/**
 * A contribution as the network sees it: what kind, how big, when, and whether
 * it has sold. No titles, no storage paths, and no addresses — the
 * protocol-wide view never needed to know whose dataset it was looking at, only
 * that the contributions came from different people.
 *
 * `contributor_id` is a salted digest, enough to count distinct contributors
 * and no more. Salted rather than plain, because contributor addresses are
 * public on the ledger — the consent contract publishes them as event topics —
 * so an unsalted hash of one is a lookup anybody can perform, and this view
 * would answer it with a named person's whole upload history. The salt lives
 * in a schema no caller can read, so the digest stays a key rather than a
 * pseudonym. It comes from the `network_activity` view rather than the table,
 * which is why this works without a session: the view is the entire public
 * surface, and row-level security keeps the table itself out of reach.
 * See schema.sql.
 */
export type NetworkRow = {
  contributor_id: string;
  source_type: string;
  byte_size: number;
  created_at: string;
};

/**
 * Ceiling on rows pulled into the browser for the network view. Well above
 * the testnet's real volume; when the table outgrows it, this bucketing moves
 * into Postgres rather than paging here.
 */
const MAX_ROWS = 10_000;

/** Every contribution on the protocol, newest first, anonymised. */
export async function listNetworkDatasets(): Promise<NetworkRow[]> {
  const { data, error } = await supabase
    .from("network_activity")
    .select("contributor_id, source_type, byte_size, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) throw error;
  return (data ?? []) as NetworkRow[];
}
