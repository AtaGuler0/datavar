"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Arrow } from "./night";

export type Showcase = {
  /** The tab's name, and the label over the step. */
  tab: string;
  title: string;
  body: string;
  link: { label: string; href: string };
  screen: ReactNode;
};

/**
 * Product shots told by scrolling, text first: the steps run down the left,
 * and the right column holds a row of tabs over one large screen, pinned
 * while the reader moves through them. The step crossing the middle of the
 * viewport picks the tab and the screen; a tab can be clicked to jump to its
 * step. On anything narrower each step carries its own screen under its text.
 */
export function ShowcaseScroll({
  items,
  action,
}: {
  items: Showcase[];
  /** Set under the last step, on the left. */
  action?: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const steps = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.i));
          }
        }
      },
      // A zero-height band across the middle: exactly one step is in it.
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const step of steps.current) if (step) observer.observe(step);
    return () => observer.disconnect();
  }, []);

  const goTo = (i: number) => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    steps.current[i]?.scrollIntoView({
      block: "center",
      behavior: reduced ? "auto" : "smooth",
    });
  };

  return (
    <>
      <div className="mt-20 grid gap-10 lg:mt-24 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-14">
        <ol>
          {items.map((item, i) => (
            <li
              key={item.tab}
              ref={(el) => {
                steps.current[i] = el;
              }}
              data-i={i}
              className={`flex flex-col justify-center py-10 transition-opacity duration-500 lg:min-h-[72vh] lg:py-0 ${
                i === active ? "" : "lg:opacity-25"
              }`}
            >
              <p className="font-mono text-[0.8125rem] tracking-[0.1em] text-star-dim uppercase">
                <span className="mr-3 text-star-ghost">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {item.tab}
              </p>
              <h3 className="mt-6 text-[2rem] leading-[1.08] font-medium tracking-[-0.04em] text-balance text-star sm:text-[2.5rem]">
                {item.title}
              </h3>
              <p className="mt-5 max-w-md text-[1.0625rem] leading-relaxed text-pretty text-star-dim">
                {item.body}
              </p>
              <Link
                href={item.link.href}
                className="group mt-5 inline-flex items-center gap-2 self-start py-2 text-[0.9375rem] text-star transition-colors hover:text-white"
              >
                {item.link.label}
                <Arrow className="h-3.5 w-3.5 text-star-dim transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>

              {/* The way in sits under the last step, in the space the
                  pinned screen leaves beside it. */}
              {action && i === items.length - 1 && (
                <div className="mt-10 hidden lg:block">{action}</div>
              )}

              {/* As tall as the screen's own content: a fixed frame left
                  most of a phone's screen empty under the shorter ones. */}
              <div className="mt-8 lg:hidden">{item.screen}</div>
            </li>
          ))}
        </ol>

        <div className="hidden lg:block">
          <div className="sticky top-24">
            <div
              role="tablist"
              aria-label="Screens"
              className="grid grid-cols-4 gap-3"
            >
              {items.map((item, i) => (
                <button
                  key={item.tab}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => goTo(i)}
                  className={`border-t-2 pt-3 text-left font-mono text-[0.75rem] tracking-[0.1em] uppercase transition-colors duration-300 ${
                    i === active
                      ? "border-star text-star"
                      : "border-line-strong text-star-faint hover:text-star-dim"
                  }`}
                >
                  {item.tab}
                </button>
              ))}
            </div>

            {/* Every screen occupies the same cell, so nothing jumps when they
              swap. Sized to the viewport so the frame never runs under the
              fold while it is pinned. */}
            <div className="mt-5 grid h-[min(34rem,calc(100vh-15rem))]">
              {items.map((item, i) => (
                <div
                  key={item.tab}
                  aria-hidden={i !== active}
                  className={`col-start-1 row-start-1 min-h-0 transition-[opacity,transform] duration-500 ease-[var(--ease-out-soft)] ${
                    i === active
                      ? "opacity-100"
                      : "pointer-events-none translate-y-2 opacity-0"
                  }`}
                >
                  {item.screen}
                </div>
              ))}
            </div>

            <p className="mt-3 text-right font-mono text-[0.6875rem] text-star-ghost">
              Sample data · Stellar testnet
            </p>
          </div>
        </div>
      </div>

      {/* On a phone there is no pinned column: the same line after the steps. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 lg:hidden">
        {action}
        <p className="font-mono text-[0.6875rem] text-star-ghost">
          Sample data · Stellar testnet
        </p>
      </div>
    </>
  );
}
