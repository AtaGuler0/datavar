"use client";

import { useEffect, useRef, useState } from "react";

const WIDE = "(min-width: 64rem)";

/**
 * Which of a scrolled list's items is the current one, read from the items
 * themselves crossing a line across the viewport, not computed from scroll
 * offsets, so it stays right whatever their heights turn out to be.
 *
 * On a wide screen the pinned stage sits beside the list and the line is the
 * viewport's middle. On a phone the stage is pinned over the list, so the
 * line drops below it, into the part of the screen the text can be read in.
 *
 * `goTo` scrolls an item to where it reads as current: centred beside the
 * stage, or just under it.
 */
export function useActiveStep<T extends HTMLElement>() {
  const [active, setActive] = useState(0);
  const items = useRef<(T | null)[]>([]);
  const stage = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wide = window.matchMedia(WIDE);
    let observer: IntersectionObserver | undefined;

    const observe = () => {
      observer?.disconnect();
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActive(Number((entry.target as HTMLElement).dataset.i));
            }
          }
        },
        // A zero-height band: exactly one item is in it.
        {
          rootMargin: wide.matches
            ? "-50% 0px -50% 0px"
            : "-72% 0px -28% 0px",
        },
      );
      for (const item of items.current) if (item) observer.observe(item);
    };

    observe();
    wide.addEventListener("change", observe);
    return () => {
      wide.removeEventListener("change", observe);
      observer?.disconnect();
    };
  }, []);

  const goTo = (i: number) => {
    const item = items.current[i];
    if (!item) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";
    if (window.matchMedia(WIDE).matches || !stage.current) {
      item.scrollIntoView({ block: "center", behavior });
      return;
    }
    const under = stage.current.getBoundingClientRect().height + 64;
    window.scrollTo({
      top: item.getBoundingClientRect().top + window.scrollY - under,
      behavior,
    });
  };

  return { active, items, stage, goTo };
}
