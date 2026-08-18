import { NextResponse } from "next/server";
import { Keypair, WebAuth } from "@stellar/stellar-sdk";
import { adminListEmpty, isAdminWallet } from "@/lib/auth/admins";
import { AuthConfigError, issueToken } from "@/lib/auth/jwt";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { STELLAR } from "@/lib/stellar/config";
import { SESSION_TTL_SECONDS, authDomain } from "../shared";

/**
 * Step two: take the signed challenge back and, if it checks out, mint a
 * session.
 *
 * Everything that matters happens in `verifyChallengeTxSigners`. It confirms
 * the challenge is one we issued (our signature is on it), that it is still
 * inside its time bounds, that it names this domain, and that the wallet it was
 * issued to has signed it. Only then does the address in it mean anything.
 *
 * Whether that address is an operator is decided here too, against a list that
 * never leaves the server, and travels in the signed token from then on. The
 * browser is told the answer; it does not get to choose it.
 *
 * One limit worth naming: challenges are stateless. We know we issued one
 * because it carries our signature, but we do not record that it was spent, so
 * a signed challenge captured in flight could be replayed inside its 5-minute
 * window. That buys an attacker a session for the wallet that already signed —
 * an attacker who could capture it could equally capture the token itself.
 * Recording spent nonces is the tightening, and it needs a table.
 */

// stellar-sdk needs Node built-ins; the edge runtime can't carry it.
export const runtime = "nodejs";

export async function POST(request: Request) {
  // Also the ceiling on grinding at the replay window named above: a captured
  // challenge is still good for five minutes, but not for unlimited attempts.
  const limited = await enforceRateLimit(request, RATE_LIMITS.authSession);
  if (limited) return limited;

  const secret = process.env.STELLAR_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Wallet sign-in isn't configured. Set STELLAR_AUTH_SECRET on the server.",
      },
      { status: 503 },
    );
  }

  let body: { challenge?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (typeof body.challenge !== "string" || !body.challenge) {
    return NextResponse.json(
      { error: "A signed challenge is required." },
      { status: 400 },
    );
  }

  const serverAccount = Keypair.fromSecret(secret).publicKey();
  const domain = authDomain(request);

  let wallet: string;
  try {
    const { clientAccountID } = WebAuth.readChallengeTx(
      body.challenge,
      serverAccount,
      STELLAR.networkPassphrase,
      domain,
      domain,
    );

    // The signer list is the wallet the challenge was issued to, so this proves
    // that specific key signed — not merely that someone did.
    WebAuth.verifyChallengeTxSigners(
      body.challenge,
      serverAccount,
      STELLAR.networkPassphrase,
      [clientAccountID],
      domain,
      domain,
    );

    wallet = clientAccountID;
  } catch {
    return NextResponse.json(
      { error: "That challenge didn't check out. Start sign-in again." },
      { status: 401 },
    );
  }

  try {
    const admin = isAdminWallet(wallet);
    const { token, expiresAt } = issueToken({
      wallet,
      admin,
      ttlSeconds: SESSION_TTL_SECONDS,
    });

    return NextResponse.json({
      token,
      wallet,
      admin,
      expiresAt,
      // A deployment with no operators named is a configuration problem, not a
      // permission one, and the panel says so rather than refusing silently.
      adminListEmpty: adminListEmpty(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AuthConfigError
            ? e.message
            : "Couldn't issue a session.",
      },
      { status: 503 },
    );
  }
}
