import Link from "next/link";
import { Logo } from "../logo";
import { MobileNav } from "./side-nav";
import { WalletButton } from "./wallet-button";

/**
 * Small-screen chrome only — on desktop the rail carries the logo, nav and
 * wallet. Keeps the landing header's paper/backdrop treatment so the product
 * still feels like the same building on a phone.
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-xl md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Datavar home">
            <Logo />
          </Link>
          <span className="hidden h-4 w-px bg-rule sm:block" />
          <span className="hidden font-mono text-[0.6875rem] tracking-[0.02em] text-ink-faint sm:inline">
            Contributor
          </span>
        </div>
        <WalletButton />
      </div>
      <MobileNav />
    </header>
  );
}
