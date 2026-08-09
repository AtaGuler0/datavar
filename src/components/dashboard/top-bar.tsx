"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "../logo";
import { MobileMenu } from "./side-nav";
import { WalletButton } from "./wallet-button";

/**
 * Small-screen chrome only — on desktop the rail carries the logo, nav and
 * wallet. Keeps the landing header's paper/backdrop treatment so the product
 * still feels like the same building on a phone.
 *
 * The five sections used to sit here as a horizontal strip that ran off the
 * right edge: Earnings was past the fold on a 390px screen, discoverable only
 * by swiping a row nothing suggested was swipeable. They live behind the
 * hamburger now, in the same order the rail lists them, with room for the rail
 * footer's operator link and testnet notice that the strip had nowhere to put.
 */
export function TopBar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const close = () => desktop.matches && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    desktop.addEventListener("change", close);
    window.addEventListener("keydown", onKey);
    return () => {
      desktop.removeEventListener("change", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header
        className={`sticky top-0 z-40 border-b border-rule md:hidden ${
          // Solid while the menu is open. backdrop-filter would make this bar
          // the containing block for the fixed sheet below and collapse it to
          // the height of the bar — the bug the landing header had.
          open ? "bg-paper" : "bg-paper/85 backdrop-blur-xl"
        }`}
      >
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link href="/" aria-label="Datavar home" className="shrink-0">
            <Logo />
          </Link>

          <div className="flex min-w-0 items-center gap-1.5">
            <WalletButton />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="dashboard-menu"
              className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center"
            >
              <span className="flex w-5 flex-col gap-[5px]">
                <span
                  className={`h-px w-full bg-ink transition-transform duration-300 ${
                    open ? "translate-y-[3px] rotate-45" : ""
                  }`}
                />
                <span
                  className={`h-px w-full bg-ink transition-transform duration-300 ${
                    open ? "-translate-y-[3px] -rotate-45" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      {open && <MobileMenu onNavigate={() => setOpen(false)} />}
    </>
  );
}
