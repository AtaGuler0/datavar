import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The session token, minted here and verified in two places: by us, on our own
 * routes, and by Supabase, on every query the browser makes.
 *
 * That second reader is the reason this is a JWT signed with Supabase's own
 * secret rather than something of our own design. A token Supabase accepts
 * lets row-level security do the enforcing — a contributor's wallet is a claim
 * inside a signed token, so the database itself refuses to hand over someone
 * else's rows. Checking ownership in application code only works as long as
 * every query remembers to check.
 *
 * HS256 by hand rather than a JWT library: it is a header, a payload and one
 * HMAC, and this is the only shape we ever mint or accept.
 *
 * This depends on Supabase's symmetric secret — the one it now calls the
 * legacy JWT secret, and the same one that signs the project's anon key. A
 * project migrated to asymmetric signing keys with the legacy secret revoked
 * would break here, because Supabase keeps the private half of those. The way
 * out is a JWKS endpoint of our own registered under Third-Party Auth, at
 * which point this file signs with our key rather than theirs.
 */

export type SessionClaims = {
  /** The Stellar address that proved it holds the key. */
  wallet: string;
  /** Whether that address is on the server-side operator allowlist. */
  admin: boolean;
  /** Expiry, unix seconds. */
  exp: number;
};

const ISSUER = "datavar-web-auth";
/** PostgREST maps this claim to a Postgres role. */
const ROLE = "authenticated";

export class AuthConfigError extends Error {}

function secret(): Buffer {
  const value = process.env.SUPABASE_JWT_SECRET;
  if (!value) {
    throw new AuthConfigError(
      "Sessions aren't configured. Set SUPABASE_JWT_SECRET on the server.",
    );
  }
  return Buffer.from(value);
}

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function sign(input: string): string {
  return createHmac("sha256", secret()).update(input).digest("base64url");
}

/** Mints a session token for a wallet that has already proved itself. */
export function issueToken(claims: {
  wallet: string;
  admin: boolean;
  ttlSeconds: number;
  /**
   * Permission to mark a payout settled. Never set on a token a browser
   * receives — only the payout route mints one for itself, for the length of
   * one payment. See `can_settle()` in schema.sql.
   */
  settle?: boolean;
}): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + claims.ttlSeconds;

  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      // Supabase reads these two.
      role: ROLE,
      aud: ROLE,
      // Ours. Policies read `wallet`, `admin` and `settle`.
      wallet: claims.wallet,
      admin: claims.admin,
      ...(claims.settle ? { settle: true } : {}),
      iss: ISSUER,
      iat: now,
      exp,
    }),
  );

  return { token: `${header}.${payload}.${sign(`${header}.${payload}`)}`, expiresAt: exp };
}

/**
 * Verifies a token we minted. Returns null for anything that fails — a bad
 * signature, a wrong issuer, an expired token and a malformed string are all
 * the same answer to the caller: there is no session here.
 */
export function verifyToken(token: string): SessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;

  const expected = Buffer.from(sign(`${header}.${payload}`));
  const actual = Buffer.from(signature);
  // Compare in constant time, and only after the lengths match — timingSafeEqual
  // throws rather than returning false on a length mismatch.
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (claims.iss !== ISSUER) return null;
  if (typeof claims.wallet !== "string" || !claims.wallet) return null;
  if (typeof claims.exp !== "number") return null;
  if (claims.exp <= Math.floor(Date.now() / 1000)) return null;

  return {
    wallet: claims.wallet,
    admin: claims.admin === true,
    exp: claims.exp,
  };
}
