"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "./logo";
import { SectionLink } from "./section-link";

/** Sections of the landing page — fragments, so they scroll rather than load. */
const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#earnings", label: "Earnings" },
  { href: "/#buyers", label: "For AI teams" },
];

/**
 * The marketing header: dark from the start, with a white pill for the call
 * to action.
 */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // The bar is transparent over the top of the page and takes a ground once
  // anything has scrolled under it.
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setScrolled(window.scrollY > 12);
    };
    // Scroll fires far more often than the screen repaints — coalesce to one
    // read per frame.
    const schedule = () => {
      frame ||= requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
    };
  }, []);

  // The mobile sheet covers the page; don't let the page scroll behind it.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // The sheet is md:hidden, so widening past the breakpoint hides it — but the
  // state would stay open and the scroll lock above with it, leaving a desktop
  // page that cannot scroll. Rotating a tablet is enough to hit this.
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

  const linkTone = "text-star-dim hover:text-star";
  const sheetRow = "border-b border-line py-4 text-lg text-star";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          // No blur while the sheet is open, and not only to save the GPU a
          // full-screen filter it cannot see through: backdrop-filter makes
          // this header the containing block for any fixed descendant, which
          // is why the sheet used to collapse to the height of the bar and let
          // the page take the taps meant for it. The sheet is a sibling now,
          // and this stays solid so the two can never interact again.
          open
            ? "border-b border-line bg-night"
            : scrolled
              ? "border-b border-line bg-night/85 backdrop-blur-xl"
              : "border-b border-transparent"
        }`}
      >
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          {/* Scrolls rather than navigates, and does it without leaving "#top"
              in the address bar — the fragment is meaningless to anyone who
              copies the URL, since it names the top of the page you are on. */}
          <Link
            href="/"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) return;
              // Only a scroll when the top of this page is what "home" means.
              // From the blog it has to be a real navigation.
              if (window.location.pathname !== "/") return;
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="relative z-10 flex items-center gap-5"
            aria-label="Datavar home"
          >
            <Logo />
            <span aria-hidden="true" className="hidden h-5 w-px bg-line-strong md:block" />
          </Link>

          <div className="mr-auto ml-5 hidden items-center gap-8 md:flex">
            {LINKS.map((link) => (
              <SectionLink
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors duration-300 ${linkTone}`}
              >
                {link.label}
              </SectionLink>
            ))}
            {/* A route rather than a fragment, so a real Link: it prefetches
                and navigates, which SectionLink's scroll handling can't do. */}
            <Link
              href="/docs"
              className={`text-sm transition-colors duration-300 ${linkTone}`}
            >
              Docs
            </Link>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {/* Was a fragment to the pitch block, back when there was nothing
                to send anyone to. It goes to the catalogue now. */}
            <Link
              href="/market"
              className={`rounded-lg px-3.5 py-2 text-sm transition-colors duration-300 ${linkTone}`}
            >
              Marketplace
            </Link>
            <Link
              href="/dashboard"
              className="rounded-[12px] bg-star px-4 py-2 text-sm font-medium text-night transition-colors duration-300 hover:bg-white"
            >
              Get started
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-menu"
            className="relative z-10 -mr-2 flex h-10 w-10 items-center justify-center md:hidden"
          >
            <span className="flex w-5 flex-col gap-[5px]">
              <span
                className={`h-px w-full transition-[transform,background-color] duration-300 ${
                  "bg-star"
                } ${open ? "translate-y-[3px] rotate-45" : ""}`}
              />
              <span
                className={`h-px w-full transition-[transform,background-color] duration-300 ${
                  "bg-star"
                } ${open ? "-translate-y-[3px] -rotate-45" : ""}`}
              />
            </span>
          </button>
        </nav>
      </header>

      {/* A sibling of the header, not a child: see the note on its className.
          Scrollable in its own right, because a phone in landscape has less
          height than this list needs, and overscroll-contain stops the rubber
          band at the end from handing the gesture to the page underneath. */}
      {open && (
        <div
          id="site-menu"
          className="fixed inset-0 top-16 z-40 overflow-y-auto overscroll-contain bg-night px-6 pt-6 pb-10 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <SectionLink
                key={link.href}
                href={link.href}
                onNavigate={() => setOpen(false)}
                className={sheetRow}
              >
                {link.label}
              </SectionLink>
            ))}
            <Link
              href="/docs"
              onClick={() => setOpen(false)}
              className={sheetRow}
            >
              Docs
            </Link>
            <Link
              href="/market"
              onClick={() => setOpen(false)}
              className={sheetRow}
            >
              Marketplace
            </Link>
          </div>
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="mt-8 block rounded-[14px] bg-star py-3.5 text-center font-medium text-night"
          >
            Get started
          </Link>
        </div>
      )}
    </>
  );
}
