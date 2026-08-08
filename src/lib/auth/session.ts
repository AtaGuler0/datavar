import { verifyToken, type SessionClaims } from "./jwt";

/**
 * Reading the session on a route. One helper, so no route invents its own idea
 * of who is calling — the wallet a request claims in its body is worth nothing,
 * and the wallet in a verified token is worth everything.
 */

/** Pulls and verifies the bearer token. Null when there is no valid session. */
export function readSession(request: Request): SessionClaims | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifyToken(header.slice(7).trim());
}
