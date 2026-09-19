import { verifySigned } from "./jwt";

/**
 * Reading a Supabase Auth session on the server.
 *
 * When somebody signs in with Google, Supabase — not us — issues the token,
 * and it is signed with the same secret this project already verifies with. So
 * the check is cheap, and the only real work is refusing to confuse the two
 * kinds of token that secret covers.
 *
 * Ours carries a `wallet` that a SEP-10 signature proved. This one carries an
 * email address that Google vouched for and no wallet at all. Treating the
 * second as the first would mean an account could stand in for a key, which is
 * the one thing this product never lets happen — so nothing here returns a
 * wallet, and the routes that use it go and look one up.
 *
 * This inherits jwt.ts's dependency on the legacy symmetric secret. A project
 * switched to asymmetric signing keys issues Google sessions we cannot verify
 * here, and the fix is the same one named there: a JWKS reader.
 */

export type AuthAccount = {
  /** `auth.users.id`, and the primary key of `public.identities`. */
  userId: string;
  /** What Google said the address is. Shown back to the person, never mailed. */
  email: string | null;
  /** `google` today; recorded rather than assumed, for the next provider. */
  provider: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The issuer Supabase stamps its own tokens with, for this project only. */
function issuer(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return `${url.replace(/\/+$/, "")}/auth/v1`;
}

/**
 * Verifies a Supabase Auth access token. Null for anything that isn't one:
 * a bad signature, an expired session, a token of ours wearing the wrong hat,
 * or an anonymous sign-in, which proves nobody.
 */
export function verifyAuthToken(token: string): AuthAccount | null {
  const expected = issuer();
  if (!expected) return null;

  let claims: Record<string, unknown> | null;
  try {
    claims = verifySigned(token);
  } catch {
    // No signing secret configured: the server can verify nothing, so it has
    // no sessions. Same answer readSession() gives.
    return null;
  }
  if (!claims) return null;

  if (claims.iss !== expected) return null;
  if (claims.role !== "authenticated") return null;
  if (claims.is_anonymous === true) return null;

  const userId = claims.sub;
  if (typeof userId !== "string" || !UUID.test(userId)) return null;

  const metadata = (claims.app_metadata ?? {}) as Record<string, unknown>;

  return {
    userId,
    email: typeof claims.email === "string" ? claims.email : null,
    provider:
      typeof metadata.provider === "string" ? metadata.provider : "unknown",
  };
}
