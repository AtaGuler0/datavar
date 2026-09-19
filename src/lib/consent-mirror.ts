import { AuthConfigError, issueToken } from "@/lib/auth/jwt";
import { logFailure } from "@/lib/log";
import { listReceipts, type ConsentReceipt } from "@/lib/stellar/consent";
import { supabaseForToken } from "@/lib/supabase/client";

/**
 * Keeping this database's copy of the consent ledger honest.
 *
 * The contract is the record and nothing here changes that. What this does is
 * make the record filterable: the catalogue has to answer "which of these 525
 * datasets may I license" in one query, and asking the ledger would be one
 * simulation per contributor before a buyer had even chosen a category.
 *
 * The rule that keeps the mirror from becoming a second opinion: it is only
 * ever written from what the contract just returned. Nothing here takes a
 * receipt from a request body, and the purchase route re-reads the receipt
 * on-chain before it sells anything — so the worst a stale row can do is offer
 * a listing that then declines to be bought.
 *
 * Writing needs a token carrying `mirror`, scoped to the contributor whose
 * receipts are being written. A browser never receives one; these are minted
 * here, for the length of one read-then-write.
 */

/** Long enough to walk a contributor's receipts and write them. */
const MIRROR_TTL_SECONDS = 120;

/** Unix seconds from the ledger → the timestamptz Postgres wants. */
function at(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function row(receipt: ConsentReceipt) {
  return {
    receipt_id: Number(receipt.id),
    contributor: receipt.contributor,
    buyer: receipt.buyer,
    dataset_hash: receipt.datasetHash,
    purpose: receipt.purpose,
    granted_at: at(receipt.grantedAt),
    expires_at: at(receipt.expiresAt),
    revoked_at: receipt.revokedAt === null ? null : at(receipt.revokedAt),
    synced_at: new Date().toISOString(),
  };
}

/**
 * Reads every receipt one contributor holds and writes them all down.
 *
 * All of them rather than the one that just changed, because a grant and a
 * revoke are the same call from here and the walk costs the same either way —
 * and because a mirror that only ever learns about the receipt it was told
 * about is a mirror that drifts. `revoked_at` arriving as null on a row that
 * already has one is not possible: the contract never un-revokes.
 *
 * Returns how many receipts were written, or throws with something worth
 * logging. Callers treat a failure as a warning, never as a failed grant: the
 * ledger has already moved by the time this runs.
 */
export async function mirrorReceipts(contributor: string): Promise<number> {
  const receipts = await listReceipts(contributor);
  if (receipts.length === 0) return 0;

  const { token } = issueToken({
    wallet: contributor,
    admin: false,
    ttlSeconds: MIRROR_TTL_SECONDS,
    mirror: true,
  });

  const { error } = await supabaseForToken(token)
    .from("consents")
    .upsert(receipts.map(row), { onConflict: "receipt_id" });

  if (error) throw error;
  return receipts.length;
}

/**
 * The same, for a caller that would rather have a warning than an exception —
 * every route that mirrors does so *after* a transaction has landed, where the
 * useful answer is "it worked, and our copy may be a moment behind" rather than
 * a failure the person could act on.
 */
export async function mirrorQuietly(
  contributor: string,
  where: string,
): Promise<string | undefined> {
  try {
    await mirrorReceipts(contributor);
    return undefined;
  } catch (e) {
    logFailure(`consent mirror ${where}`, e);
    return e instanceof AuthConfigError
      ? e.message
      : "It's on the ledger. Our copy of it will catch up.";
  }
}
