/**
 * The ramp's whole configuration.
 *
 * A SEP integration's handoff is two values: a home domain and an asset code.
 * Everything else — where to authenticate, where to deposit, which issuer the
 * asset has — is discovered from the domain's stellar.toml at runtime, which is
 * why nothing below names an endpoint. Pointing this at a real Turkish anchor
 * on mainnet is a change to these two constants and the network, nothing more.
 *
 * This directory is deliberately self-contained: it reads the shared network
 * constants and nothing else of datavar's. The catalogue, the payout vaults and
 * the database do not know it exists, and it does not know they do. What joins
 * them is the wallet: USDC bought here is USDC the marketplace will take.
 */

export const ANCHOR_HOME_DOMAIN =
  process.env.NEXT_PUBLIC_ANCHOR_HOME_DOMAIN ?? "tr-mock-anchor.fly.dev";

export const ANCHOR_ASSET_CODE =
  process.env.NEXT_PUBLIC_ANCHOR_ASSET_CODE ?? "USDC";

/** The off-chain side of the pair, as SEP-38 names it (ISO 4217). */
export const FIAT_CODE = "TRY";
export const FIAT_ASSET = `iso4217:${FIAT_CODE}`;

/** How the fiat leg moves. The anchor offers one method and names it this. */
export const DELIVERY_METHOD = "bank_account";

/** SEP-38 quotes are scoped to the SEP they will be spent in. */
export const QUOTE_CONTEXT = "sep6";

/** How often a transaction waiting on the anchor is re-read, in ms. */
export const POLL_INTERVAL_MS = 3000;

export function isAnchorConfigured(): boolean {
  return ANCHOR_HOME_DOMAIN.length > 0;
}
