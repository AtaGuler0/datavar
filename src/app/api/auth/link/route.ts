import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth/google";
import { readSession } from "@/lib/auth/session";
import { logFailure } from "@/lib/log";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import {
  UNIQUE_VIOLATION,
  identityByWallet,
  linkIdentity,
  unlinkIdentity,
} from "@/lib/supabase/identities";

/**
 * Attaching a Google account to a wallet, and detaching it.
 *
 * Both proofs have to be in the same request, and each one is checked against
 * something that cannot be asserted by the caller: the wallet comes out of a
 * session token minted after a SEP-10 signature, and the account comes out of
 * a token Supabase signed. Neither is read from the body. That is the whole
 * security property here — a link made from one proof would let whichever side
 * was unproved claim the other.
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Sign in with your wallet first." },
      { status: 401 },
    );
  }

  const limited = await enforceRateLimit(
    request,
    RATE_LIMITS.authLink,
    session.wallet,
  );
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
      { error: "That Google sign-in didn't check out. Try again." },
      { status: 401 },
    );
  }

  try {
    // One wallet, one account. Told plainly rather than as a constraint name:
    // the person on the other side of this usually has two Google accounts and
    // has forgotten which one they used.
    const existing = await identityByWallet(session.wallet);
    if (existing && existing.user_id !== account.userId) {
      return NextResponse.json(
        {
          error: `This wallet is already attached to ${existing.email ?? "another Google account"}. Sign in with that account, or detach it first.`,
        },
        { status: 409 },
      );
    }

    const identity = await linkIdentity({
      userId: account.userId,
      wallet: session.wallet,
      email: account.email,
      provider: account.provider,
    });

    return NextResponse.json({
      linked: true,
      wallet: identity.wallet,
      email: identity.email,
    });
  } catch (e) {
    // The other collision: this account is linked to a different wallet, and
    // moving it here would leave two accounts on one wallet.
    if (
      typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      return NextResponse.json(
        {
          error:
            "That Google account is already attached to a different wallet.",
        },
        { status: 409 },
      );
    }

    logFailure("auth/link", e);
    return NextResponse.json(
      { error: "Couldn't attach that account." },
      { status: 503 },
    );
  }
}

/** Detaching. The wallet keeps every dataset, receipt and payout it had. */
export async function DELETE(request: Request) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Sign in with your wallet first." },
      { status: 401 },
    );
  }

  const limited = await enforceRateLimit(
    request,
    RATE_LIMITS.authLink,
    session.wallet,
  );
  if (limited) return limited;

  try {
    await unlinkIdentity(session.wallet);
    return NextResponse.json({ linked: false });
  } catch (e) {
    logFailure("auth/unlink", e);
    return NextResponse.json(
      { error: "Couldn't detach that account." },
      { status: 503 },
    );
  }
}
