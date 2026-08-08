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
