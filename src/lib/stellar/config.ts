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
} as const;

/** GABC…WXYZ — enough to recognise an address without spilling the whole key. */
export function truncateAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
