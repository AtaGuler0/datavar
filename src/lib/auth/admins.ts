/**
 * Who is an operator. Server-side only — no `NEXT_PUBLIC_` prefix, so the list
 * never reaches a browser and cannot be read off the page by someone deciding
 * whose wallet to impersonate.
 *
 * This replaces an allowlist the client checked against itself. The old one
 * hid the panel; this one defends it, because the answer is decided here, put
 * into a signed token, and enforced again by row-level security on every query
 * the panel makes.
 */
const ALLOWED = (process.env.ADMIN_WALLETS ?? "")
  .split(",")
  .map((address) => address.trim())
  .filter(Boolean);

export function isAdminWallet(address: string): boolean {
  return ALLOWED.includes(address);
}

/** True when nobody has been named an operator — a deployment mistake, and
 *  worth saying so rather than refusing everyone without explanation. */
export function adminListEmpty(): boolean {
  return ALLOWED.length === 0;
}
