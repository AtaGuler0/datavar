import { NextResponse } from "next/server";
import { issueRateLimitToken } from "@/lib/auth/jwt";
import { supabaseForMintedToken } from "@/lib/supabase/client";

/**
 * Ceilings on the routes a stranger can reach.
 *
 * Until this existed there were none anywhere, and the routes that most needed
 * one were the routes with no session: consent submission holds a connection
 * open for up to fifteen seconds waiting for a ledger to close, and the sign-in
 * challenge does keypair work for anyone who asks. Neither is expensive once;
 * both are an outage in a loop.
 *
 * The counter is a Postgres row, not a variable. Serverless means the next
 * request may not reach this process at all, so a counter in memory counts
 * approximately nothing. See `rate_limit_hit()` in supabase/schema.sql — the
 * table lives in the `internal` schema and only a token this file mints may
 * touch it.
 *
 * These limits are deliberately loose. They are here to stop a script, not to
 * meter honest use, and the first person to hit one should be someone doing
 * something strange.
 */

export type RateLimitRule = {
  /** Namespace for the counter, so two routes never share a budget. */
  bucket: string;
  /** Requests allowed per window, per subject. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export const RATE_LIMITS = {
  /** No session, and the poll loop holds a connection while the ledger closes. */
  consentSubmit: { bucket: "consent:submit", limit: 5, windowSeconds: 60 },
  /** No session; every call simulates against the consent contract. */
  consentRead: { bucket: "consent:read", limit: 60, windowSeconds: 60 },
  /** No session; builds unsigned XDR, which is a contract simulation each time. */
  consentBuild: { bucket: "consent:build", limit: 20, windowSeconds: 60 },
  /** No session, and a keypair operation per call. */
  authChallenge: { bucket: "auth:challenge", limit: 20, windowSeconds: 60 },
  /** No session. Also the ceiling on grinding at the 5-minute replay window. */
  authSession: { bucket: "auth:session", limit: 20, windowSeconds: 60 },
  /** Has a session, so counted per wallet: a claim is a payment. */
  claims: { bucket: "claims", limit: 30, windowSeconds: 60 },
  /** No session by design — the vault is public — but it reads the chain. */
  payoutsRead: { bucket: "payouts:read", limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

/** Long enough to make the call, and useless for anything else. */
const TOKEN_TTL_SECONDS = 60;

let client: ReturnType<typeof supabaseForMintedToken> | null = null;

function db() {
  client ??= supabaseForMintedToken(() => issueRateLimitToken(TOKEN_TTL_SECONDS));
  return client;
}

/** How often the same failure is worth repeating in the log. */
const LOG_EVERY_MS = 60_000;
const lastLogged = new Map<string, number>();

/**
 * Says what went wrong, once a minute per bucket rather than once a request.
 *
 * The failure this exists for is the schema not having been run on a
 * deployment, and that one is true of every request — logged plainly it would
 * bury the log it was meant to write to. Throttled, it still says it, forever,
 * until someone fixes it. What it must never do is say nothing.
 */
function report(bucket: string, detail: string) {
  const now = Date.now();
  const previous = lastLogged.get(bucket);
  if (previous !== undefined && now - previous < LOG_EVERY_MS) return;
  lastLogged.set(bucket, now);
  console.error(`[rate-limit] ${bucket} not enforced: ${detail}`);
}

/**
 * Who this request is counted against.
 *
 * `x-real-ip` first: on Vercel the platform sets it to the connecting address
 * and a client cannot forge it, whereas `x-forwarded-for` is a list a caller
 * may already have put entries into. Behind a proxy that sets neither, every
 * caller shares one bucket — a limit that is too strict rather than absent,
 * which is the right way for this to be wrong.
 */
function clientAddress(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

/**
 * Counts this request and returns the response to send if it is over the line,
 * or null to carry on:
 *
 *     const limited = await enforceRateLimit(request, RATE_LIMITS.claims, wallet);
 *     if (limited) return limited;
 *
 * Pass `subject` on routes that have a session — a wallet is a truer identity
 * than an address, and shared networks shouldn't share a budget. Routes without
 * one fall back to the caller's address.
 *
 * Fails open. If the secret is missing or the database can't be reached this
 * returns null and logs, because a limiter that turns a database blip into a
 * site-wide outage has done more damage than the traffic it was meant to stop.
 * The log line is the part that must not be silent.
 */
export async function enforceRateLimit(
  request: Request,
  rule: RateLimitRule,
  subject?: string,
): Promise<NextResponse | null> {
  try {
    const { data, error } = await db().rpc("rate_limit_hit", {
      p_bucket: rule.bucket,
      p_subject: subject || clientAddress(request),
      p_limit: rule.limit,
      p_window: rule.windowSeconds,
    });

    if (error) {
      report(rule.bucket, error.message);
      return null;
    }

    const retryAfter = typeof data === "number" ? data : 0;
    if (retryAfter <= 0) return null;

    return NextResponse.json(
      { error: "That's a lot of requests. Give it a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  } catch (e) {
    report(rule.bucket, e instanceof Error ? e.message : String(e));
    return null;
  }
}
