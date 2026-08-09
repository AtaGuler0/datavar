"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "../logo";
import { WalletButton } from "../dashboard/wallet-button";
import { AdminMobileMenu } from "./side-nav";

/** Small-screen chrome for the operator side; the rail carries it on desktop.
 *  Same shape as the contributor bar — see the note there for why the sheet is
 *  a sibling and why this goes solid instead of blurred while it is open. */
export function AdminTopBar() {
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
              aria-controls="admin-menu"
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

      {open && <AdminMobileMenu onNavigate={() => setOpen(false)} />}
    </>
  );
}
