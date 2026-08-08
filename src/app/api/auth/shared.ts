/**
 * The two halves of sign-in have to agree on the domain the challenge names and
 * how long it stays good for, so both read them from here.
 */

/** How long a challenge stays signable. SEP-10's own default. */
export const CHALLENGE_TIMEOUT_SECONDS = 300;

/** How long a session lasts before the wallet has to sign again. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/**
 * The domain a challenge is bound to, taken from the request rather than an
 * env var: a challenge issued for localhost then replayed against production
 * fails to match, without anyone having to remember to set a variable per
 * deployment.
 */
export function authDomain(request: Request): string {
  return new URL(request.url).host;
}
