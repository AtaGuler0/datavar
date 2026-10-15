import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { bearerToken, readSession } from "@/lib/auth/session";
import { mirrorReceipts } from "@/lib/consent-mirror";
import { logFailure } from "@/lib/log";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import {
  ConsentError,
  isConsentConfigured,
  readReceipt,
} from "@/lib/stellar/consent";
import { DATASETS_BUCKET, supabaseForToken } from "@/lib/supabase/client";

/**
 * Handing a buyer the file they licensed.
 *
 * Storage alone used to answer this: a policy asked whether a sale named the
 * wallet and whether the licence had run out, and if so it made a link. Both
 * of those are database facts, and neither of them knows that the contributor
 * withdrew consent an hour ago. So the product's load-bearing claim — consent
 * can be withdrawn, and withdrawal means something — stopped at the moment of
 * sale, which is the moment it matters least.
 *
 * This route puts the contract back in the path. Every fetch of a licensed
 * file re-reads the receipt behind it, and a receipt that is revoked or expired
 * produces a 403 rather than a URL. Not a nightly job and not a mirror lookup:
 * the read happens now, so the gap between a revoke landing on the ledger and
 * delivery stopping is one ledger close.
 *
 * What it deliberately does not claim: this cannot reach a copy already
 * downloaded. Nothing can. What it does is make sure the bytes are not handed
 * over again after the answer changed, which is the part that was missing and
 * the part a buyer's auditor can test — revoke, ask, read the 403.
 *
 * The signed URL is still minted with the buyer's own token, so the storage
 * policy runs as well. This route can only ever refuse more than the policy
 * would, never less: there is no service key here and no way for this file to
 * reach a dataset nobody bought.
 */

// stellar-sdk needs Node built-ins; the edge runtime can't carry it.
export const runtime = "nodejs";

/** How long a download link stays good. Long enough to click, not to share. */
const SIGNED_URL_SECONDS = 120;

type SaleRow = {
  id: string;
  licence_expires_at: string | null;
  consent_receipt_id: number | null;
  datasets: { storage_path: string } | null;
};

const SALE_COLUMNS =
  "id, licence_expires_at, consent_receipt_id, datasets (storage_path)";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const session = readSession(request);
  const token = bearerToken(request);
  if (!session || !token) {
    return fail("Sign in with the wallet that licensed this.", 401);
  }
  if (!StrKey.isValidEd25519PublicKey(session.wallet)) {
    return fail("That session isn't for a Stellar address.", 400);
  }

  const limited = await enforceRateLimit(
    request,
    RATE_LIMITS.marketDownload,
    session.wallet,
  );
  if (limited) return limited;

  // Refusing outright rather than falling back to the policy: a deployment
  // that cannot read consent is a deployment that cannot honour a withdrawal,
  // and serving the file anyway would be the failure this route exists to stop.
  if (!isConsentConfigured()) {
    return fail("The consent contract isn't configured on this deployment.", 503);
  }

  let body: { saleId?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const saleId = typeof body.saleId === "string" ? body.saleId : "";
  if (!saleId) return fail("Which licence?", 400);

  try {
    return await deliver(session.wallet, token, saleId);
  } catch (e) {
    logFailure("market download", e);
    if (e instanceof ConsentError) {
      // The contract is the gate; if it cannot be asked, nothing is handed over.
      return fail("Consent couldn't be checked just now. Try again shortly.", 502);
    }
    return fail("The file didn't come back. Try again in a moment.", 502);
  }
}

/** The licence, as the buyer — row-level security decides it is theirs. */
async function licence(token: string, saleId: string): Promise<SaleRow | null> {
  const { data, error } = await supabaseForToken(token)
    .from("sales")
    .select(SALE_COLUMNS)
    .eq("id", saleId)
    .eq("channel", "market")
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as SaleRow) ?? null;
}

async function deliver(wallet: string, token: string, saleId: string) {
  const sale = await licence(token, saleId);
  if (!sale?.datasets) {
    return fail("You don't hold a licence for that.", 404);
  }

  const expires = sale.licence_expires_at;
  if (expires !== null && new Date(expires).getTime() <= Date.now()) {
    return fail("This licence has run out.", 403);
  }

  // A market sale carries its receipt by constraint, so this is defence rather
  // than a case — and it refuses, because an unverifiable licence is one this
  // route has nothing to say about.
  if (sale.consent_receipt_id === null) {
    return fail(
      "This licence doesn't name a consent receipt, so it can't be verified.",
      403,
    );
  }

  const receipt = await readReceipt(sale.consent_receipt_id);
  if (receipt.status !== "active") {
    // The mirror is what the catalogue filters on, and it has just been shown
    // to disagree with the ledger. Correcting it here keeps the listing from
    // being sold again on the strength of a row we already know is wrong.
    await refreshMirror(receipt.contributor);

    return fail(
      receipt.status === "revoked"
        ? "The contributor withdrew consent for this dataset, so it is no longer delivered. Your receipt and payment stay on the ledger as the record of what was agreed and when it ended."
        : "The consent behind this licence has expired, so the file is no longer delivered.",
      403,
    );
  }

  const { data, error } = await supabaseForToken(token)
    .storage.from(DATASETS_BUCKET)
    .createSignedUrl(sale.datasets.storage_path, SIGNED_URL_SECONDS);

  if (error) throw error;
  return NextResponse.json({ url: data.signedUrl, wallet });
}

/** Best effort: a stale mirror is worth fixing, not worth failing a refusal for. */
async function refreshMirror(contributor: string): Promise<void> {
  try {
    await mirrorReceipts(contributor);
  } catch (e) {
    logFailure("market download mirror", e);
  }
}
