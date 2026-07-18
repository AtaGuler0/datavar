"use client";

import { useEffect, useState } from "react";
import { Logo } from "./logo";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#earnings", label: "Earnings" },
  { href: "#buyers", label: "For AI teams" },
  { href: "#trust", label: "Consent" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The mobile sheet covers the page; don't let the page scroll behind it.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open
          ? "border-b border-rule bg-paper/85 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="relative z-10" aria-label="Datavar home">
          <Logo />
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-ink-dim transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <a
            href="#buyers"
            className="rounded-lg px-3.5 py-2 text-sm text-ink-dim transition-colors hover:text-ink"
          >
            Buy data
          </a>
          <a
            href="#cta"
            className="rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate"
          >
            Become a contributor
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="relative z-10 -mr-2 flex h-10 w-10 items-center justify-center md:hidden"
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
      </nav>

      {open && (
        <div className="fixed inset-0 top-16 bg-paper px-6 pt-6 md:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b border-rule py-4 text-lg text-ink"
              >
                {link.label}
              </a>
            ))}
          </div>
          <a
            href="#cta"
            onClick={() => setOpen(false)}
            className="mt-8 block rounded-lg bg-slate-deep py-3.5 text-center font-medium text-paper"
          >
            Become a contributor
          </a>
        </div>
      )}
    </header>
  );
}
