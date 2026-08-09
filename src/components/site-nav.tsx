"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { SectionLink } from "./section-link";

/** Sections of the landing page — fragments, so they scroll rather than load. */
const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#earnings", label: "Earnings" },
  { href: "/#buyers", label: "For AI teams" },
  { href: "/#faq", label: "FAQ" },
];

/** The header is `h-16`; its midline is what decides which side of a colour
 *  boundary it is on. Flipping there rather than at the top or bottom edge
 *  means the swap happens when most of the bar has already crossed. */
const HEADER_MIDLINE = 32;

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [onDark, setOnDark] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  /* Both flags come off the same read: whether the page has moved at all, and
     whether a dark block is currently behind the bar. Sections that paint a
     dark background tag themselves with data-nav-tone="dark" — the header
     doesn't need to know which section it is or what page it is on, only that
     something dark is under it, so it can invert instead of sitting there as a
     pale slab over the enterprise block. Re-read per route: the marketing
     shell and the blog render different trees under the same header. */
  useEffect(() => {
    const darkZones = Array.from(
      document.querySelectorAll<HTMLElement>('[data-nav-tone="dark"]'),
    );

    let frame = 0;
    const read = () => {
      frame = 0;
      setScrolled(window.scrollY > 12);
      setOnDark(
        darkZones.some((zone) => {
          const box = zone.getBoundingClientRect();
          return box.top <= HEADER_MIDLINE && box.bottom >= HEADER_MIDLINE;
        }),
      );
    };
    // Scroll fires far more often than the screen repaints, and this reads
    // layout — coalesce to one measurement per frame.
    const schedule = () => {
      frame ||= requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [pathname]);

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

  // The open sheet is a light surface, so the bar belongs to the sheet while
  // it is up no matter what is scrolled behind it.
  const inverted = onDark && !open;

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
            ? "border-b border-rule bg-paper"
            : !scrolled
              ? "border-b border-transparent"
              : inverted
                ? "border-b border-rule-dark bg-ink-950/85 backdrop-blur-xl"
                : "border-b border-rule bg-paper/85 backdrop-blur-xl"
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
            className="relative z-10"
            aria-label="Datavar home"
          >
            <Logo tone={inverted ? "dark" : "light"} />
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {LINKS.map((link) => (
              <SectionLink
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors duration-300 ${
                  inverted
                    ? "text-chalk-dim hover:text-chalk"
                    : "text-ink-dim hover:text-ink"
                }`}
              >
                {link.label}
              </SectionLink>
            ))}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <SectionLink
              href="/#buyers"
              className={`rounded-lg px-3.5 py-2 text-sm transition-colors duration-300 ${
                inverted
                  ? "text-chalk-dim hover:text-chalk"
                  : "text-ink-dim hover:text-ink"
              }`}
            >
              Buy data
            </SectionLink>
            {/* Slate on ink-950 is nearly the same value, so the button would
                read as a hole in the bar. Over a dark block it flips to the
                paper side of the palette and keeps its weight. */}
            <Link
              href="/dashboard"
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-300 ${
                inverted
                  ? "bg-paper text-ink hover:bg-chalk"
                  : "bg-slate-deep text-paper hover:bg-slate"
              }`}
            >
              Become a contributor
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
                  inverted ? "bg-chalk" : "bg-ink"
                } ${open ? "translate-y-[3px] rotate-45" : ""}`}
              />
              <span
                className={`h-px w-full transition-[transform,background-color] duration-300 ${
                  inverted ? "bg-chalk" : "bg-ink"
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
          className="fixed inset-0 top-16 z-40 overflow-y-auto overscroll-contain bg-paper px-6 pt-6 pb-10 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <SectionLink
                key={link.href}
                href={link.href}
                onNavigate={() => setOpen(false)}
                className="border-b border-rule py-4 text-lg text-ink"
              >
                {link.label}
              </SectionLink>
            ))}
          </div>
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="mt-8 block rounded-lg bg-slate-deep py-3.5 text-center font-medium text-paper"
          >
            Become a contributor
          </Link>
        </div>
      )}
    </>
  );
}
