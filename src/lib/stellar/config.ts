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
 * There is deliberately no treasury address here any more.
 *
 * There used to be an account that held the money and sent payouts, and this
 * file exported its address so the operator panel could show a balance. Both
 * are gone: the funds live in the payout contract, and the only key the server
 * holds is the operator's, which signs credits and holds nothing. An address
 * whose balance is the answer to "can we pay people" no longer exists — that
 * question is now asked of the contract, via `funded` and `owed`.
 */

/** 1 XLM = 10,000,000 stroops. Money is integers here, all the way down. */
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
