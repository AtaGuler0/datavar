import { NextResponse } from "next/server";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { ConsentError, isConsentConfigured, submit } from "@/lib/stellar/consent";

/**
 * Sends a transaction the contributor's wallet has already signed, and waits
 * for the ledger to close on it.
 *
 * This route holds no key and adds no signature — it is a relay, kept on the
 * server only because submitting means carrying the SDK. A transaction that
 * arrives here unsigned, or signed by the wrong wallet, is rejected by the
 * network rather than by us.
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
    return NextResponse.json({ hash: await submit(body.xdr) });
  } catch (e) {
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
