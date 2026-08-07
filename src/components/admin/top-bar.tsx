import Link from "next/link";
import { Logo } from "../logo";
import { WalletButton } from "../dashboard/wallet-button";
import { AdminMobileNav } from "./side-nav";

/** Small-screen chrome for the operator side; the rail carries it on desktop. */
export function AdminTopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-xl md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Datavar home">
            <Logo />
          </Link>
          <span className="hidden h-4 w-px bg-rule sm:block" />
          <span className="hidden font-mono text-[0.6875rem] tracking-[0.02em] text-ink-faint sm:inline">
            Operator
          </span>
        </div>
        <WalletButton />
      </div>
      <AdminMobileNav />
    </header>
  );
}
