import { NextResponse } from "next/server";
import { logFailure } from "@/lib/log";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { mirrorQuietly } from "@/lib/consent-mirror";
import { ConsentError, isConsentConfigured, submit } from "@/lib/stellar/consent";
import { sourceAccount } from "@/lib/stellar/soroban";

/**
 * Sends a transaction the contributor's wallet has already signed, and waits
 * for the ledger to close on it.
 *
 * This route holds no key and adds no signature — it is a relay, kept on the
 * server only because submitting means carrying the SDK. A transaction that
 * arrives here unsigned, or signed by the wrong wallet, is rejected by the
 * network rather than by us.
 *
 * Once it lands, this database's copy of the contributor's receipts is brought
 * up to date from the contract — which is what puts a newly consented dataset
 * into the marketplace catalogue, and what takes a revoked one out of it. The
 * mirror is read back from the ledger rather than assembled from the request,
 * and a failure to write it is reported as a lag, not as a failed grant: the
 * consent is on-chain either way. See lib/consent-mirror.ts.
 */

// stellar-sdk needs Node built-ins; the edge runtime can't carry it.
export const runtime = "nodejs";

export async function POST(request: Request) {
  // Before anything else: this is the route with no session and the longest
  // hold, so it is the one worth spending a round trip to protect.
  const limited = await enforceRateLimit(request, RATE_LIMITS.consentSubmit);
  if (limited) return limited;

  if (!isConsentConfigured()) {
    return NextResponse.json(
      { error: "The consent contract isn't configured on this deployment." },
      { status: 503 },
    );
  }

  let body: { xdr?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (typeof body.xdr !== "string" || !body.xdr) {
    return NextResponse.json(
      { error: "A signed transaction is required." },
      { status: 400 },
    );
  }

  try {
    const hash = await submit(body.xdr);

    // The contributor is the account the transaction was built for; both calls
    // this route relays — grant and revoke — are signed by them.
    const contributor = sourceAccount(body.xdr);
    const warning = contributor
      ? await mirrorQuietly(contributor, "submit")
      : undefined;

    return NextResponse.json({ hash, ...(warning ? { warning } : {}) });
  } catch (e) {
    // A contributor has already signed by the time this runs, so a failure here
    // is a grant they authorised and did not get. Worth a line either way.
    logFailure("consent/submit", e);
    return NextResponse.json(
      {
        error:
          e instanceof ConsentError
            ? e.message
            : "The transaction didn't go through.",
      },
      { status: 502 },
    );
  }
}
