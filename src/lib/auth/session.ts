import { AuthConfigError, verifyToken, type SessionClaims } from "./jwt";

/**
 * Reading the session on a route. One helper, so no route invents its own idea
 * of who is calling — the wallet a request claims in its body is worth nothing,
 * and the wallet in a verified token is worth everything.
 */

/** Pulls and verifies the bearer token. Null when there is no valid session. */
export function readSession(request: Request): SessionClaims | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return verifyToken(header.slice(7).trim());
  } catch (e) {
    // A server with no signing secret can verify nothing, so it has no
    // sessions — which is "not signed in", not a crash. Anything else is a
    // real fault and belongs upstairs.
    if (e instanceof AuthConfigError) return null;
    throw e;
  }
}

/**
 * The raw token, for a route that needs to act *as* the caller rather than
 * merely know who they are.
 *
 * Used where the answer should be exactly what the caller could have got for
 * themselves — a buyer's own profile, a buyer's own licences. Passing their
 * token to Supabase means row-level security applies unchanged, so the route
 * cannot accidentally read further than the person who asked.
 */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}
