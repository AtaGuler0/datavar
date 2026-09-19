/**
 * Stellar network the whole product runs against. Testnet for now — no real
 * value moves. Kept as plain constants (no wallet-kit import) so server code
 * and future Horizon/Soroban calls can read it without pulling the browser
 * wallet bundle onto the server.
 */
export const STELLAR = {
  network: "TESTNET",
  networkPassphrase: "Test SDF Network ; September 2015",
  horizonUrl: "https://horizon-testnet.stellar.org",
  sorobanRpcUrl: "https://soroban-testnet.stellar.org",
  friendbotUrl: "https://friendbot.stellar.org",
  explorerUrl: "https://stellar.expert/explorer/testnet",
} as const;

/**
 * The consent receipt contract — where a grant stops being a row we own and
 * becomes ledger state anyone can check. Public by nature: an address is meant
 * to be read, and the whole argument for putting consent on-chain is that
 * verifying it needs nobody's permission.
 */
export const CONSENT_CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONSENT_CONTRACT_ID ?? "";

/**
 * The payout vault — where a contributor's earnings sit between the sale and
 * the claim. Public for the same reason the consent contract is: the point of
 * holding payouts in a contract rather than an account is that anyone can read
 * what it holds and what it owes, without asking us.
 */
export const PAYOUT_CONTRACT_ID = process.env.NEXT_PUBLIC_PAYOUT_CONTRACT_ID ?? "";

/**
 * The second vault, holding USDC.
 *
 * The same contract, deployed twice. Its token is fixed at construction and
 * cannot be changed afterwards — a vault that could swap assets would strand
 * every balance credited under the old one — so an asset is a deployment, not
 * a setting. Two instances of code that has already been argued about beats one
 * instance of code rewritten to carry a map.
 *
 * Nothing about the first vault changed when this arrived. XLM balances, XLM
 * claims and the 223 sales that predate it are where they were.
 */
export const PAYOUT_USDC_CONTRACT_ID =
  process.env.NEXT_PUBLIC_PAYOUT_USDC_CONTRACT_ID ?? "";

/**
 * USDC as it exists on testnet here: the asset the Turkish ramp issues, and
 * the Soroban token contract that wraps it.
 *
 * The issuer is the asset's identity. The SAC id is derived from it and is the
 * address the vault actually talks to — a Soroban contract cannot hold a
 * classic asset except through its wrapper. Both are pinned rather than
 * discovered, because the anchor's stellar.toml decides what the *ramp* deals
 * in, and a payout vault that changed asset because a file on someone else's
 * server changed would be a very quiet way to lose money.
 */
export const USDC = {
  code: "USDC",
  issuer:
    process.env.NEXT_PUBLIC_USDC_ISSUER ??
    "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  contract:
    process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ??
    "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
} as const;

/**
 * What a purchase or a payout can be denominated in.
 *
 * Two assets, one shape. Both have seven decimals on Stellar, so every amount
 * in this product stays the same kind of integer and only the label changes —
 * which is the reason `price_stroops` on a sale is still called that while
 * meaning either.
 */
export type PayAsset = "XLM" | "USDC";

export const PAY_ASSETS = ["XLM", "USDC"] as const;

/** Whether a string off a request or a row is an asset we settle in. */
export function isPayAsset(value: unknown): value is PayAsset {
  return value === "XLM" || value === "USDC";
}

/** The vault that holds this asset. Empty when it isn't deployed here. */
export function vaultFor(asset: PayAsset): string {
  return asset === "USDC" ? PAYOUT_USDC_CONTRACT_ID : PAYOUT_CONTRACT_ID;
}

export function isAssetConfigured(asset: PayAsset): boolean {
  return vaultFor(asset).length > 0;
}

/** The assets this deployment can actually take money in. */
export function configuredAssets(): PayAsset[] {
  return PAY_ASSETS.filter(isAssetConfigured);
}

/**
 * There is deliberately no treasury address here any more.
 *
 * There used to be an account that held the money and sent payouts, and this
 * file exported its address so the operator panel could show a balance. Both
 * are gone: the funds live in the payout contract, and the only key the server
 * holds is the operator's, which signs credits and holds nothing. An address
 * whose balance is the answer to "can we pay people" no longer exists — that
 * question is now asked of the contract, via `funded` and `owed`.
 */

/**
 * The address a dataset is listed for sale to.
 *
 * Listing is not a flag on a row: a contributor lists a dataset by granting
 * consent to *this* address on the consent contract, and the catalogue is the
 * set of datasets holding such a receipt, unrevoked and unexpired. Which makes
 * a listing something a buyer can verify without us, and a delisting something
 * a contributor can do without asking.
 *
 * It has to match `market_address` in internal.secrets (supabase/schema.sql) or
 * nothing appears in the catalogue — the grant form would be naming one address
 * while the view looked for another.
 */
export const MARKET_ADDRESS = process.env.NEXT_PUBLIC_MARKET_ADDRESS ?? "";

export function isMarketConfigured(): boolean {
  return MARKET_ADDRESS.length > 0;
}

/**
 * 1 XLM = 10,000,000 stroops. Money is integers here, all the way down.
 *
 * USDC on Stellar has seven decimals too, so this is the divisor for both and
 * an amount never has to be told which asset it is to be scaled — only to be
 * printed.
 */
export const STROOPS_PER_XLM = 10_000_000;

/** Stroops → the decimal string Horizon wants: 25000000 → "2.5000000". */
export function stroopsToAmount(stroops: number): string {
  return (stroops / STROOPS_PER_XLM).toFixed(7);
}

/** Stroops → display XLM: 25000000 → "2.5". Trailing zeros trimmed. */
export function formatXlm(stroops: number): string {
  const xlm = stroops / STROOPS_PER_XLM;
  // Up to 2dp is all the price band (1–10 XLM) ever needs; more is noise.
  return xlm.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * An amount in the asset it is in. XLM is priced in tenths and prints like a
 * price; USDC is money people already read to the cent, so it keeps both of
 * them.
 */
export function formatAmount(units: number, asset: PayAsset): string {
  if (asset !== "USDC") return formatXlm(units);
  return (units / STROOPS_PER_XLM).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * An amount that may be in more than one asset.
 *
 * Two vaults mean a contributor's earnings, a dataset's takings and an
 * operator's queue are all potentially two numbers. They are kept as two, and
 * printed as two: "12.4 XLM · 3.25 USDC". Adding them would need a rate, and a
 * rate is exactly the thing this product does not have.
 */
export type Money = Partial<Record<PayAsset, number>>;

export function emptyMoney(): Money {
  return { XLM: 0, USDC: 0 };
}

export function addMoney(into: Money, asset: PayAsset, units: number): Money {
  return { ...into, [asset]: (into[asset] ?? 0) + units };
}

export function moneyTotal(money: Money): number {
  return PAY_ASSETS.reduce((sum, asset) => sum + (money[asset] ?? 0), 0);
}

/** "12.4 XLM · 3.25 USDC", or "0 XLM" when there is nothing in any of them. */
export function formatMoney(money: Money): string {
  const said = PAY_ASSETS.filter((asset) => (money[asset] ?? 0) > 0).map(
    (asset) => `${formatAmount(money[asset] ?? 0, asset)} ${asset}`,
  );
  return said.length > 0 ? said.join(" · ") : "0 XLM";
}

/** A transaction on the public explorer, for anyone who wants to verify it. */
export function explorerTxUrl(hash: string): string {
  return `${STELLAR.explorerUrl}/tx/${hash}`;
}

/** An account on the public explorer. */
export function explorerAccountUrl(address: string): string {
  return `${STELLAR.explorerUrl}/account/${address}`;
}

/** A contract on the public explorer — the "go check it yourself" link. */
export function explorerContractUrl(contractId: string): string {
  return `${STELLAR.explorerUrl}/contract/${contractId}`;
}

/** GABC…WXYZ — enough to recognise an address without spilling the whole key. */
export function truncateAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
