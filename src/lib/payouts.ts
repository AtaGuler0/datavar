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
  /** One per signed batch. */
  hashes: string[];
  /** Sales our copy had wrong, put right without a signature. */
  reconciled: number;
  /** Set when the ledger and our copy of it didn't both land. */
  warning?: string;
};

/**
 * A credit signs one batch at a time and the caller comes back for the next, so
 * a large queue can't ask for an unbounded number of wallet prompts in one go.
 * The contract's own ceiling is what makes batches exist.
 */
const MAX_BATCHES = 8;

async function post(body: unknown, fallback: string) {
  const res = await fetch("/api/payouts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => null);
  if (!res.ok) throw new Error(parsed?.error ?? fallback);
  return parsed;
}

/**
 * Writes every sale that isn't in the payout contract yet into it, signed by
 * the operator's own wallet.
 *
 * Called the moment a sale is recorded rather than left to a button someone
 * remembers to press: until this runs the money is still ours, the contributor
 * sees a payout they cannot take, and nothing in the interface explains why.
 * Crediting is idempotent — the contract refuses a sale it has already seen, and
 * the server reconciles that before asking for a signature — so running it per
 * sale costs a transaction and risks nothing.
 *
 * Needs an operator session *and* the wallet the contract names as operator.
 * Throws with the server's own message, which the caller should report *beside*
 * the sale rather than instead of it: the sale is recorded either way, and a
 * failed credit is a retry, not a lost sale.
 */
export async function creditPending(
  signTransaction: (xdr: string) => Promise<string>,
): Promise<CreditResult> {
  let credited = 0;
  let reconciled = 0;
  let warning: string | undefined;
  const hashes: string[] = [];

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const built = await post(
      { action: "build" },
      "The payouts couldn't be prepared.",
    );
    reconciled += Number(built?.reconciled ?? 0);

    // Nothing left that needs signing. Either the queue is empty or what was in
    // it turned out to be on-chain already.
    if (!built?.xdr) break;

    const signed = await signTransaction(built.xdr);
    const done = await post(
      { action: "submit", xdr: signed, saleIds: built.saleIds },
      "The credit didn't go through.",
    );

    credited += Number(done?.credited ?? 0);
    if (done?.hash) hashes.push(done.hash as string);
    if (done?.warning) warning = done.warning;

    if (!built.remaining) break;
    if (batch === MAX_BATCHES - 1) {
      warning = `${built.remaining} more sales are still waiting. Credit again to finish them.`;
    }
  }

  return { credited, hashes, reconciled, warning };
}

/**
 * Lets a wallet credit, or stops it. Only the contract's admin can sign either,
 * and the wallet defaults to the one signing — which is how a deployment gets
 * its first operator without anyone opening a terminal.
 *
 * The contract keeps a set, so this adds and removes rather than replaces:
 * two or three people can each credit from their own wallet, and one leaving
 * doesn't take the others' access with them.
 */
export async function changeOperator(
  signTransaction: (xdr: string) => Promise<string>,
  action: "add-operator" | "remove-operator",
  operator?: string,
): Promise<string> {
  const built = await post(
    { action, operator },
    "Couldn't prepare that change.",
  );
  const signed = await signTransaction(built.xdr);
  const done = await post(
    { action: "submit", xdr: signed },
    "The change didn't go through.",
  );
  return done.hash as string;
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
