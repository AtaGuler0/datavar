import { NextResponse } from "next/server";
import { adminListEmpty, isAdminWallet } from "@/lib/auth/admins";
import { AuthConfigError, MAX_SESSION_AGE_SECONDS, issueToken } from "@/lib/auth/jwt";
import { readSession } from "@/lib/auth/session";
import { logFailure } from "@/lib/log";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { SESSION_TTL_SECONDS } from "../shared";

/**
 * Keeping a session alive without asking for the signature again.
 *
 * A session lasts twelve hours, which is the right ceiling for a token sitting
 * in localStorage and the wrong thing to make somebody feel: a person who
 * signed in yesterday and comes back today was asked to sign again, from a
 * browser that still held their proof. This is the missing half of that — a
 * sliding window. Visit inside the twelve hours and the clock restarts; stay
 * away longer and the signature is asked for once more.
 *
 * It trades nothing away that the token had not already spent. Whoever holds a
 * valid token can act as that wallet until it expires either way; what this
 * adds is that it keeps working while it is being used, which is what every
 * session in the world does. It cannot resurrect an expired token —
 * `readSession` refuses those — and it cannot be used to make one for somebody
 * else, because the wallet is read from the signature-backed token and never
 * from the request.
 *
 * One thing is deliberately re-read rather than carried over: whether this
 * wallet is an operator. The allowlist lives on the server and can change, and
 * a refresh is the moment to notice — a wallet removed from it loses the claim
 * at the next refresh rather than at the next signature.
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session) {
    // Expired, forged or absent. All three mean the same thing to a browser:
    // sign in again.
    return NextResponse.json({ error: "No session to refresh." }, { status: 401 });
  }

  const limited = await enforceRateLimit(
    request,
    RATE_LIMITS.authSession,
    session.wallet,
  );
  if (limited) return limited;

  // A refresh extends a session, it doesn't start one. Past the maximum age
  // the browser has to sign in again, so a token copied once can't be kept
  // alive forever by refreshing it.
  const now = Math.floor(Date.now() / 1000);
  if (now - session.authTime > MAX_SESSION_AGE_SECONDS) {
    return NextResponse.json(
      { error: "This session is too old to refresh. Sign in again." },
      { status: 401 },
    );
  }

  try {
    // Operator rights only for a session opened with the wallet's signature.
    // A Google session, or a token from before `via` existed, refreshes as a
    // contributor session.
    const via = session.via ?? "google";
    const admin = via === "wallet" && isAdminWallet(session.wallet);
    const { token, expiresAt } = issueToken({
      wallet: session.wallet,
      admin,
      ttlSeconds: SESSION_TTL_SECONDS,
      via,
      authTime: session.authTime,
    });

    return NextResponse.json({
      token,
      wallet: session.wallet,
      admin,
      expiresAt,
      adminListEmpty: adminListEmpty(),
    });
  } catch (e) {
    logFailure("auth/refresh", e);
    return NextResponse.json(
      {
        error:
          e instanceof AuthConfigError ? e.message : "Couldn't refresh the session.",
      },
      { status: 503 },
    );
  }
}
