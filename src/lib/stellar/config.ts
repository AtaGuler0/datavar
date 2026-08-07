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
  friendbotUrl: "https://friendbot.stellar.org",
  explorerUrl: "https://stellar.expert/explorer/testnet",
} as const;

/**
 * The account payouts are paid from. Public key only — it's an address, it's
 * meant to be read. Its secret lives in STELLAR_TREASURY_SECRET, server-side,
 * and is never imported by anything under a "use client" boundary.
 */
export const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_STELLAR_TREASURY ?? "";

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

/** GABC…WXYZ — enough to recognise an address without spilling the whole key. */
export function truncateAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
