import { NextResponse } from "next/server";
import { adminListEmpty, isAdminWallet } from "@/lib/auth/admins";
import { verifyAuthToken } from "@/lib/auth/google";
import { AuthConfigError, issueToken } from "@/lib/auth/jwt";
import { logFailure } from "@/lib/log";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { identityByUser, refreshIdentityEmail } from "@/lib/supabase/identities";
import { SESSION_TTL_SECONDS } from "../shared";

/**
 * Signing in with a Google account that has already been attached to a wallet.
 *
 * The exchange is deliberately narrow: a Supabase Auth token comes in, and
 * what goes out is a session for the wallet that token's account was linked
 * to — never for a wallet the request named, because the request does not get
 * to name one. If no link exists this refuses with a 404 rather than inventing
 * an identity, and the browser's answer to that is to ask for a signature.
 *
 * What this does not do is make the session any more powerful than the one a
 * signature produces. It is the same token with the same claims; the wallet is
 * still the only thing that can sign a transaction, and the server still holds
 * no key. This shortens the walk back in, and that is all.
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, RATE_LIMITS.authGoogle);
  if (limited) return limited;

  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (typeof body.token !== "string" || !body.token) {
    return NextResponse.json(
      { error: "A Google session is required." },
      { status: 400 },
    );
  }

  const account = verifyAuthToken(body.token);
  if (!account) {
    return NextResponse.json(
      { error: "That sign-in didn't check out. Try again." },
      { status: 401 },
    );
  }

  try {
    const identity = await identityByUser(account.userId);
    if (!identity) {
      // Not an error the person did anything to cause: a first Google sign-in
      // simply has no wallet behind it yet. The browser reads `linked` and
      // asks them to connect one.
      return NextResponse.json(
        {
          linked: false,
          email: account.email,
          error:
            "This account isn't attached to a wallet yet. Connect one to finish.",
        },
        { status: 404 },
      );
    }

    await refreshIdentityEmail(identity, account.email);

    const admin = isAdminWallet(identity.wallet);
    const { token, expiresAt } = issueToken({
      wallet: identity.wallet,
      admin,
      ttlSeconds: SESSION_TTL_SECONDS,
    });

    return NextResponse.json({
      linked: true,
      token,
      wallet: identity.wallet,
      admin,
      expiresAt,
      adminListEmpty: adminListEmpty(),
      email: account.email,
    });
  } catch (e) {
    logFailure("auth/google", e);
    return NextResponse.json(
      {
        error:
          e instanceof AuthConfigError ? e.message : "Couldn't issue a session.",
      },
      { status: 503 },
    );
  }
}
