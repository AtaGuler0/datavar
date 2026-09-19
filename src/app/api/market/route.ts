import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { AuthConfigError, issueToken } from "@/lib/auth/jwt";
import { bearerToken, readSession } from "@/lib/auth/session";
import { logFailure } from "@/lib/log";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { ConsentError, isConsentConfigured, readReceipt } from "@/lib/stellar/consent";
import { isPayAsset, type PayAsset } from "@/lib/stellar/config";
import {
  buildFund,
  isAssetConfigured,
  PayoutError,
  submitFund,
} from "@/lib/stellar/payout";
import { supabase, supabaseForToken } from "@/lib/supabase/client";

/**
 * Buying a licence.
 *
 * Two calls with a wallet signature between them, the same shape as every other
 * money route here: this prepares a payment, the buyer's wallet signs it, this
 * relays it and writes down what it bought. The server holds no key, so it
 * cannot buy on anyone's behalf and cannot take a payment that does not go
 * where the buyer can see it go — the money lands in the payout vault, the
 * contract every contributor claims from, and never in an account of ours.
 *
 * What the request is allowed to decide is which datasets. Everything else is
 * read on this side:
 *
 *   * The price comes from the catalogue, so a buyer cannot name their own.
 *   * The consent behind each listing is re-read from the contract before
 *     anything is relayed — the catalogue is a mirror, and a mirror is fine for
 *     browsing and not fine for selling.
 *   * The transaction about to be relayed is checked to be `fund`, signed by
 *     this buyer, for exactly the total that was quoted.
 *   * The licence cannot outlive the consent that permitted it. It expires when
 *     the receipt does, which is the whole of the product's argument in one
 *     column.
 *
 * And what it writes, it writes as the buyer: a token carrying `market` for two
 * minutes, which can insert a sale naming that wallet and nothing else. There
 * is no operator token anywhere in this file.
 *
 * A basket is paid for in one asset. The buyer picks it, and picking it decides
 * three things at once: which column the price is read from, which vault the
 * money goes into, and which vault the contributor will later claim from. They
 * have to agree — a payment into the XLM vault against USDC prices would credit
 * contributors out of a contract nobody paid.
 */

// stellar-sdk needs Node built-ins; the edge runtime can't carry it.
export const runtime = "nodejs";

/** Datasets in one basket. A ceiling on consent reads more than on ambition. */
const MAX_BASKET = 25;

/** Long enough to write the licences for one checkout. */
const MARKET_TTL_SECONDS = 120;

type ListingRow = {
  id: string;
  price_stroops: number;
  price_usdc: number;
  consent_receipt_id: number;
  consent_purpose: string;
  consent_expires_at: string;
};

const LISTING_COLUMNS =
  "id, price_stroops, price_usdc, consent_receipt_id, consent_purpose, consent_expires_at";

/** What this listing costs in the asset being paid. */
function priceOf(row: ListingRow, asset: PayAsset): number {
  return Number(asset === "USDC" ? row.price_usdc : row.price_stroops);
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const session = readSession(request);
  const token = bearerToken(request);
  if (!session || !token) {
    return fail("Sign in with a wallet to license data.", 401);
  }
  if (!StrKey.isValidEd25519PublicKey(session.wallet)) {
    return fail("That session isn't for a Stellar address.", 400);
  }

  const limited = await enforceRateLimit(request, RATE_LIMITS.market, session.wallet);
  if (limited) return limited;

  if (!isConsentConfigured()) {
    return fail("The consent contract isn't configured on this deployment.", 503);
  }

  let body: {
    action?: unknown;
    datasetIds?: unknown;
    xdr?: unknown;
    asset?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const asset: PayAsset = isPayAsset(body.asset) ? body.asset : "XLM";
  if (!isAssetConfigured(asset)) {
    return fail(
      asset === "USDC"
        ? "USDC isn't configured on this deployment."
        : "The payout contract isn't configured on this deployment.",
      503,
    );
  }

  const ids = readIds(body.datasetIds);
  if (ids === null) {
    return fail(`Choose between 1 and ${MAX_BASKET} datasets.`, 400);
  }

  try {
    if (body.action === "build") {
      return await prepare(session.wallet, token, ids, asset);
    }

    if (body.action === "submit") {
      if (typeof body.xdr !== "string" || !body.xdr) {
        return fail("A signed transaction is required.", 400);
      }
      return await settle(session.wallet, token, ids, asset, body.xdr);
    }

    return fail("Unknown action.", 400);
  } catch (e) {
    logFailure(`market ${String(body.action)}`, e);
    if (e instanceof PayoutError || e instanceof ConsentError) {
      return fail(e.message, 502);
    }
    if (e instanceof AuthConfigError) return fail(e.message, 503);
    return fail("That didn't go through. Nothing was charged.", 502);
  }
}

/** The basket as the client may send it, or null if that isn't what arrived. */
function readIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BASKET) {
    return null;
  }
  if (!value.every((id) => typeof id === "string" && id.length > 0)) return null;
  // Duplicates would double the quoted total for one licence.
  return Array.from(new Set(value as string[]));
}

/**
 * The listings behind a basket, priced.
 *
 * Read from the public catalogue with the anon key rather than the caller's
 * token, deliberately: the view is what a stranger sees, so a basket can never
 * contain something the buyer could not have found, and a dataset that is not
 * listed has no price here to quote.
 */
async function basket(ids: string[]): Promise<ListingRow[]> {
  const { data, error } = await supabase
    .from("market_listings")
    .select(LISTING_COLUMNS)
    .in("id", ids);

  if (error) throw error;
  return (data ?? []) as ListingRow[];
}

function totalOf(rows: ListingRow[], asset: PayAsset): number {
  return rows.reduce((sum, row) => sum + priceOf(row, asset), 0);
}

/**
 * Asks the contract whether each listing's receipt is still good.
 *
 * Read one at a time and by id, so the answer is about the exact receipt the
 * licence will name. A revoke that landed a minute ago is invisible to the
 * catalogue until the mirror catches up, and selling under it would be the one
 * failure this product cannot afford: a licence citing consent that no longer
 * exists.
 */
async function checkConsent(rows: ListingRow[]): Promise<string | null> {
  const receipts = await Promise.all(
    rows.map((row) => readReceipt(row.consent_receipt_id)),
  );

  const stale = receipts.filter((receipt) => receipt.status !== "active");
  if (stale.length === 0) return null;

  return stale.length === 1
    ? `One of those datasets is no longer consented — its receipt is ${stale[0].status}. Remove it and try again.`
    : `${stale.length} of those datasets are no longer consented. Refresh the catalogue and try again.`;
}

/** Whether this wallet has filed who they are. Read as them, not around them. */
async function buyerOrg(token: string, wallet: string): Promise<string | null> {
  const { data, error } = await supabaseForToken(token)
    .from("buyers")
    .select("org")
    .eq("wallet", wallet)
    .maybeSingle();

  if (error) throw error;
  return (data?.org as string) ?? null;
}

/** Datasets in this basket the buyer already holds a licence for. */
async function alreadyLicensed(
  token: string,
  wallet: string,
  ids: string[],
): Promise<Set<string>> {
  const { data, error } = await supabaseForToken(token)
    .from("sales")
    .select("dataset_id")
    .eq("buyer_wallet", wallet)
    .eq("channel", "market")
    .in("dataset_id", ids);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.dataset_id as string));
}

/** Prices the basket and hands back a payment for the buyer to sign. */
async function prepare(
  wallet: string,
  token: string,
  ids: string[],
  asset: PayAsset,
) {
  const org = await buyerOrg(token, wallet);
  if (!org) {
    return fail("Add your buyer details before licensing anything.", 428);
  }

  const rows = await basket(ids);
  if (rows.length !== ids.length) {
    return fail(
      "Some of those datasets aren't listed any more. Refresh the catalogue.",
      409,
    );
  }

  const owned = await alreadyLicensed(token, wallet, ids);
  if (owned.size > 0) {
    return fail(
      `You already hold a licence for ${owned.size} of those. Remove them and try again.`,
      409,
    );
  }

  const stale = await checkConsent(rows);
  if (stale) return fail(stale, 409);

  const stroops = totalOf(rows, asset);
  return NextResponse.json({
    xdr: await buildFund(asset, wallet, stroops),
    stroops,
    asset,
    datasets: rows.length,
  });
}

/**
 * Relays the signed payment and writes the licences it bought.
 *
 * Order matters: everything that can refuse does so before the transaction is
 * relayed, because after it the money has moved and a refusal is no longer
 * available. What can still go wrong afterwards — the insert — is reported with
 * the hash beside it, the same way a credit is: the ledger is the truth, the
 * row is our copy of it.
 */
async function settle(
  wallet: string,
  token: string,
  ids: string[],
  asset: PayAsset,
  xdr: string,
) {
  const org = await buyerOrg(token, wallet);
  if (!org) {
    return fail("Add your buyer details before licensing anything.", 428);
  }

  const rows = await basket(ids);
  if (rows.length !== ids.length) {
    return fail(
      "Some of those datasets aren't listed any more. Nothing was charged.",
      409,
    );
  }

  const owned = await alreadyLicensed(token, wallet, ids);
  if (owned.size > 0) {
    return fail(
      "You already hold a licence for some of those. Nothing was charged.",
      409,
    );
  }

  const stale = await checkConsent(rows);
  if (stale) return fail(stale, 409);

  // Re-priced here rather than reused from the build call: the amount checked
  // against the signed transaction has to be one this side computed just now,
  // or the check is only asking the client to agree with itself.
  const stroops = totalOf(rows, asset);
  const hash = await submitFund(asset, xdr, wallet, stroops);

  const { token: marketToken } = issueToken({
    wallet,
    admin: false,
    ttlSeconds: MARKET_TTL_SECONDS,
    market: true,
  });

  const { data, error } = await supabaseForToken(marketToken)
    .from("sales")
    .insert(
      rows.map((row) => ({
        dataset_id: row.id,
        // `owner_wallet` is not here on purpose: a trigger reads it off the
        // dataset, so who gets paid is never something a request decided.
        buyer: org,
        buyer_wallet: wallet,
        channel: "market",
        asset,
        price_stroops: priceOf(row, asset),
        purpose: row.consent_purpose,
        // A licence cannot outlive the consent it stands on.
        licence_expires_at: row.consent_expires_at,
        consent_receipt_id: row.consent_receipt_id,
        fund_tx: hash,
      })),
    )
    .select("id");

  if (error) {
    logFailure("market licences", error);
    return NextResponse.json({
      hash,
      licences: 0,
      warning: `Your payment landed in ${hash}, but the licences couldn't be written. Send us that hash and nothing is lost.`,
    });
  }

  return NextResponse.json({
    hash,
    licences: (data ?? []).length,
    stroops,
    asset,
  });
}
