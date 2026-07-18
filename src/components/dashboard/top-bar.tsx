import Link from "next/link";
import { Logo } from "../logo";
import { WalletButton } from "./wallet-button";

/**
 * The dashboard's fixed chrome. Mirrors the landing header — same height,
 * same paper/backdrop treatment, same rule underline — so crossing from the
 * marketing site into the product doesn't feel like a different building.
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Datavar home">
            <Logo />
          </Link>
          <span className="hidden h-4 w-px bg-rule sm:block" />
          <span className="hidden font-mono text-[0.6875rem] tracking-[0.02em] text-ink-faint sm:inline">
            Contributor
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper-raised px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-soft" />
            Testnet
          </span>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
