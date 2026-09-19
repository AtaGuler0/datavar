import { WebAuth } from "@stellar/stellar-sdk";
import { STELLAR } from "@/lib/stellar/config";
import { AnchorError, anchorFetch, loadAnchorToml } from "./client";
import type { AnchorSession } from "./types";

/**
 * SEP-10: logging in to the anchor by signing a challenge with the user's key.
 *
 * The same protocol datavar's own sign-in uses, pointed at somebody else's
 * server. There is no account here, no password and no email: the anchor hands
 * back a transaction that can never be submitted, the wallet signs it, and the
 * anchor answers with a JWT. Whoever holds the key is the user.
 *
 * This session has nothing to do with the datavar session. Two tokens, two
 * issuers, two audiences — and this one is never shown to our own routes, nor
 * ours to the anchor.
 */

const storageKey = (domain: string, account: string) =>
  `datavar.anchor.jwt:${domain}:${account}`;

/** JWTs are read for their expiry only; nothing here trusts their contents. */
function expiryOf(token: string): number {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = JSON.parse(json).exp;
    return typeof exp === "number" ? exp : 0;
  } catch {
    return 0;
  }
}

/** A minute of headroom, so a token cannot expire between check and send. */
function alive(session: AnchorSession): boolean {
  return session.expiresAt > Date.now() / 1000 + 60;
}

/**
 * The session lives in sessionStorage, not localStorage: closing the tab ends
 * it. It is a bearer token for a ramp, and it has no business outliving the
 * visit that created it.
 */
export function readAnchorSession(
  domain: string,
  account: string,
): AnchorSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(domain, account));
    if (!raw) return null;
    const session = JSON.parse(raw) as AnchorSession;
    return alive(session) ? session : null;
  } catch {
    return null;
  }
}

export function clearAnchorSession(domain: string, account: string): void {
  try {
    sessionStorage.removeItem(storageKey(domain, account));
  } catch {
    // A browser that refuses storage still gets a working, forgetful tab.
  }
}

/**
 * Checks that a challenge is a challenge before the wallet signs it.
 *
 * This is the step that makes SEP-10 safe to automate. The anchor hands back a
 * transaction and the wallet will sign whatever it is given; an anchor that
 * was malicious, compromised or simply misconfigured could hand back a real
 * transaction — a payment out of the user's own account — and a client that
 * forwards it straight to the wallet has turned a login button into a signing
 * oracle. The user's only defence would be reading XDR in a popup.
 *
 * The SDK's own reader enforces the whole rule: sequence zero, the anchor's
 * declared signing key as the source and as a signer, the operations a
 * challenge may contain and nothing else, this home domain, this web auth
 * domain, and timebounds that are open now. Anything else throws, and nothing
 * reaches the wallet.
 */
function assertIsChallenge(
  xdr: string,
  toml: { signingKey: string; homeDomain: string; webAuthEndpoint: string },
  account: string,
): void {
  if (!toml.signingKey) {
    throw new AnchorError(
      "the anchor publishes no SIGNING_KEY to verify its challenge",
      0,
      "stellar.toml",
    );
  }

  let webAuthDomain: string;
  try {
    webAuthDomain = new URL(toml.webAuthEndpoint).host;
  } catch {
    throw new AnchorError(
      "the anchor publishes an unreadable WEB_AUTH_ENDPOINT",
      0,
      "stellar.toml",
    );
  }

  let read: { clientAccountID: string };
  try {
    read = WebAuth.readChallengeTx(
      xdr,
      toml.signingKey,
      STELLAR.networkPassphrase,
      [toml.homeDomain],
      webAuthDomain,
    );
  } catch (e) {
    throw new AnchorError(
      `that is not a valid SEP-10 challenge, so it was not signed: ${(e as Error).message}`,
      0,
      toml.webAuthEndpoint,
    );
  }

  // A challenge names the account it authenticates. One naming somebody else
  // is a login for somebody else.
  if (read.clientAccountID !== account) {
    throw new AnchorError(
      "the challenge names a different account than the one connected",
      0,
      toml.webAuthEndpoint,
    );
  }
}

/**
 * Runs the challenge round trip. `sign` is the connected wallet's signer, so
 * the key never leaves the extension and this code never sees it.
 */
export async function authenticate(
  account: string,
  sign: (xdr: string) => Promise<string>,
): Promise<AnchorSession> {
  const toml = await loadAnchorToml();

  const challenge = await anchorFetch<{
    transaction: string;
    network_passphrase?: string;
  }>(`${toml.webAuthEndpoint}?account=${account}&home_domain=${toml.homeDomain}`);

  // The passphrase the anchor says it wants signed, checked against the one
  // the wallet will actually sign with. They disagree only when the anchor is
  // on another network, and a signature made under the wrong passphrase is
  // either worthless or, on the network it does match, real.
  if (
    challenge.network_passphrase &&
    challenge.network_passphrase !== STELLAR.networkPassphrase
  ) {
    throw new AnchorError(
      `the challenge is for another network (${challenge.network_passphrase})`,
      0,
      toml.webAuthEndpoint,
    );
  }

  assertIsChallenge(challenge.transaction, toml, account);

  const signed = await sign(challenge.transaction);

  const { token } = await anchorFetch<{ token: string }>(toml.webAuthEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transaction: signed }),
  });

  const session: AnchorSession = {
    account,
    token,
    expiresAt: expiryOf(token),
  };
  try {
    sessionStorage.setItem(
      storageKey(toml.homeDomain, account),
      JSON.stringify(session),
    );
  } catch {
    // The session still works; it just will not survive a reload.
  }
  return session;
}
