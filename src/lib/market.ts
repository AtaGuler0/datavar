import { authHeaders } from "@/lib/auth/session-store";
import type { PayAsset } from "@/lib/stellar/config";

/**
 * The browser's side of a purchase.
 *
 * Same two-step shape as a claim or a credit, and for the same reason: the
 * server builds a transaction, the wallet signs it, the server relays it. What
 * the buyer signs is a payment into the payout vault — the contract their money
 * sits in until the contributors they bought from claim it — so at no point is
 * there an account of ours holding it.
 *
 * The server counterpart is app/api/market/route.ts, and every number in the
 * quote comes from there: this file sends dataset ids and the asset to pay in,
 * and nothing else. Which asset decides which price list the basket is read
 * against and which vault the money lands in; both are settled server-side.
 */

/** What a checkout cost and bought. */
export type PurchaseResult = {
  /** The funding transaction, resolvable on any explorer. */
  hash: string;
  licences: number;
  stroops: number;
  asset: PayAsset;
  /** Set when the payment landed but our record of it didn't. */
  warning?: string;
};

/** The quote, before anything is signed. */
export type Quote = {
  xdr: string;
  stroops: number;
  asset: PayAsset;
  datasets: number;
};

async function post(body: unknown, fallback: string) {
  const res = await fetch("/api/market", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => null);
  if (!res.ok) throw new Error(parsed?.error ?? fallback);
  return parsed;
}

/** Prices a basket without buying it — what the checkout panel shows. */
export async function quoteBasket(
  datasetIds: string[],
  asset: PayAsset,
): Promise<Quote> {
  return (await post(
    { action: "build", datasetIds, asset },
    "Couldn't price those datasets.",
  )) as Quote;
}

/**
 * Buys the basket: quote, sign, relay.
 *
 * Re-quoted here rather than reusing the panel's quote, because the
 * transaction has to be built against a fresh sequence number and the server
 * re-prices it anyway. A price that moved between the two is a refusal, not a
 * surprise on the receipt.
 */
export async function licenseBasket(
  datasetIds: string[],
  asset: PayAsset,
  signTransaction: (xdr: string) => Promise<string>,
): Promise<PurchaseResult> {
  const quote = await quoteBasket(datasetIds, asset);
  const signed = await signTransaction(quote.xdr);
  const done = await post(
    { action: "submit", datasetIds, asset, xdr: signed },
    "The payment didn't go through.",
  );

  return {
    hash: done.hash as string,
    licences: Number(done.licences ?? 0),
    stroops: Number(done.stroops ?? quote.stroops),
    asset,
    warning: done.warning as string | undefined,
  };
}
