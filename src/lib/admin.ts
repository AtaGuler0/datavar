/**
 * Who gets into /admin. The allowlist is an env var of Stellar addresses, and
 * the check is "is the connected wallet one of them" — no roles table, no
 * sessions.
 *
 * Be clear-eyed about what this is: the list ships to the browser and the
 * wallet isn't asked to sign anything, so it hides the panel rather than
 * defending it. Nothing behind it can move money — the treasury key lives on
 * the server — but it does write sale rows, so before this touches anything
 * real it needs a signed challenge and a server-side check.
 */
const ALLOWED = (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "")
  .split(",")
  .map((a) => a.trim())
  .filter(Boolean);

export function isAdminWallet(address: string | null): boolean {
  return !!address && ALLOWED.includes(address);
}

/** True when nobody has been named an admin — the panel says so rather than
 *  silently refusing everyone. */
export const ADMIN_LIST_EMPTY = ALLOWED.length === 0;
