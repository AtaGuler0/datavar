import { authHeaders } from "@/lib/auth/session-store";

/**
 * The browser's side of the two money routes.
 *
 * Both live here because they are one sentence read from either end: the
 * operator writes a sale into the payout contract, and the contributor takes it
 * out. Neither is a page's private business — a sale is credited from the
 * ledger and from the inventory, and a payout is claimed from the earnings page
 * and from the dataset it came from — and having two copies of either is how
 * they drift apart. They did: the dataset row was still posting a shape the
 * claim route stopped accepting, so the button under a sold dataset could not
 * work at all.
 *
 * The server counterparts are in `app/api/payouts` and `app/api/claims`; the
 * contract calls themselves are in `lib/stellar/payout.ts`, which is Node-only
 * and cannot be reached from here.
 */

/** What a credit run did, as the panels report it. */
export type CreditResult = {
  /** Sales written into the contract by this run. */
  credited: number;
  /** Set when the ledger and our copy of it didn't both land. */
  warning?: string;
};

/**
 * Writes every sale that isn't in the payout contract yet into it.
 *
 * Called the moment a sale is recorded rather than left to a button someone
 * remembers to press: until this runs the money is still ours, the contributor
 * sees a payout they cannot take, and nothing in the interface explains why.
 * Crediting is idempotent — the contract refuses a sale it has already seen, and
 * the route reconciles that — so running it per sale costs a transaction and
 * risks nothing.
 *
 * Needs an operator session. Throws with the server's own message, which the
 * caller should report *beside* the sale rather than instead of it: the sale is
 * recorded either way, and a failed credit is a retry, not a lost sale.
 */
export async function creditPending(): Promise<CreditResult> {
  const res = await fetch("/api/payouts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ action: "credit" }),
  });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(body?.error ?? "The payouts couldn't be credited.");
  }
  // A 200 can still carry a partial failure: batches that landed, then one that
  // didn't. Both fields are the server's own wording.
  return {
    credited: Number(body?.credited ?? 0),
    warning: body?.error ?? body?.warning,
  };
}

/** A settled claim: the hash that moved it, and what moved. */
export type ClaimResult = {
  hash: string;
  /** Stroops the contract held for this wallet when the claim was built. */
  stroops: number;
  /** Paid on-chain, but our record of it didn't stick. */
  warning?: string;
};

/**
 * Claims everything the payout contract holds for the signed-in wallet.
 *
 * Two calls with a signature between them: the server asks the contract what is
 * owed and builds the transaction, the wallet signs it, the server relays it.
 * The server holds no key — it cannot claim for anyone, and cannot stop anyone
 * claiming.
 *
 * There is one balance per wallet, so there is one claim. A caller showing this
 * under a single dataset should say so rather than quote that dataset's share:
 * the transaction empties the lot.
 */
export async function claimPayout(
  signTransaction: (xdr: string) => Promise<string>,
): Promise<ClaimResult> {
  const prepared = await fetch("/api/claims", {
    method: "POST",
    // The route reads the wallet from the session, never the body — without
    // this header it is an anonymous request and rightly refused.
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ action: "build" }),
  });
  const built = await prepared.json().catch(() => null);
  if (!prepared.ok) {
    throw new Error(built?.error ?? "Couldn't prepare the claim.");
  }

  const signed = await signTransaction(built.xdr);

  const sent = await fetch("/api/claims", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ action: "submit", xdr: signed }),
  });
  const result = await sent.json().catch(() => null);
  if (!sent.ok) {
    throw new Error(result?.error ?? "The claim didn't go through.");
  }

  return {
    hash: result.hash as string,
    stroops: Number(built?.stroops ?? 0),
    warning: result?.warning,
  };
}
