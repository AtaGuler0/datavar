"use client";

/**
 * Placeholder for the Stellar wallet connection. The dashboard treats a
 * connected wallet as identity — there is no email or password anywhere in
 * the product. This renders the disconnected state only; wiring it to
 * Stellar Wallets Kit (Freighter and friends) lands in a follow-up.
 */
export function WalletButton() {
  return (
    <button
      type="button"
      disabled
      className="inline-flex items-center gap-2 rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper opacity-90 transition-colors duration-200 hover:bg-slate disabled:cursor-not-allowed"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-paper/70" />
      Connect wallet
    </button>
  );
}
