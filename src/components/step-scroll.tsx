"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plate } from "./night";

export type Step = {
  title: string;
  body: string;
  /** The headline fact under the body: a short value, a label, a note. */
  stat: { value: string; label: string; note: string };
  /** The step's name on the progress bar, and its share of the bar. */
  stage: string;
  share: number;
  fig: string;
  tag: string;
  caption: [ReactNode, ReactNode];
  figure: ReactNode;
};

/**
 * Steps told by scrolling. On a wide screen the drawing for the step in the
 * middle of the viewport stays pinned on the left, under a progress bar, and
 * swaps as the reader moves through the list on the right; a rail between the
 * two marks the place. On anything narrower the pinning would cost more room
 * than it saves, so each step simply carries its own drawing.
 *
 * Which step is active is read from the steps themselves crossing the
 * viewport's middle line, not computed from scroll offsets, so it stays right
 * whatever the steps' heights turn out to be.
 */
export function StepScroll({
  steps,
  label = "One dataset",
}: {
  steps: Step[];
  /** What the progress bar follows through the stages. */
  label?: string;
}) {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);

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
    for (const item of items.current) if (item) observer.observe(item);
    return () => observer.disconnect();
  }, []);

  const goTo = (i: number) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    items.current[i]?.scrollIntoView({
      block: "center",
      behavior: reduced ? "auto" : "smooth",
    });
  };

  const plate = (step: Step) => (
    <Plate
      fig={step.fig}
      tag={step.tag}
      caption={
        <>
          <span>{step.caption[0]}</span>
          <span>{step.caption[1]}</span>
        </>
      }
      bodyClassName="px-3 py-2 sm:px-6"
    >
      {step.figure}
    </Plate>
  );

  return (
    <div className="mt-20 grid gap-8 lg:mt-28 lg:grid-cols-[minmax(0,1.2fr)_2.5rem_minmax(0,1fr)]">
      {/* The pinned stage. */}
      <div className="hidden lg:block">
        <div className="sticky top-24">
          <ProgressBar steps={steps} active={active} label={label} />
          {/* Every drawing occupies the same cell, so the stage is as tall
              as the tallest and nothing jumps when they swap. */}
          <div className="mt-5 grid">
            {steps.map((step, i) => (
              <div
                key={step.fig}
                aria-hidden={i !== active}
                className={`col-start-1 row-start-1 transition-[opacity,transform] duration-500 ease-[var(--ease-out-soft)] ${
                  i === active
                    ? "opacity-100"
                    : "pointer-events-none translate-y-2 opacity-0"
                }`}
              >
                {plate(step)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The rail. */}
      <div className="hidden lg:block">
        <nav
          aria-label="Steps"
          className="sticky top-[calc(50vh-4.5rem)] flex h-36 flex-col items-center justify-between"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-line-strong"
          />
          <span
            aria-hidden="true"
            className="absolute top-1 left-1/2 w-px -translate-x-1/2 bg-star transition-[height] duration-500 ease-[var(--ease-out-soft)]"
            style={{
              height:
                active === 0
                  ? 0
                  : `calc(${(active / (steps.length - 1)) * 100}% - 0.5rem)`,
            }}
          />
          {steps.map((step, i) => (
            <button
              key={step.title}
              type="button"
              onClick={() => goTo(i)}
              aria-label={step.title}
              aria-current={i === active ? "step" : undefined}
              className={`relative h-2.5 w-2.5 rounded-full border transition-colors duration-300 ${
                i <= active
                  ? "border-star bg-star"
                  : "border-star-faint bg-night hover:border-star"
              }`}
            />
          ))}
        </nav>
      </div>

      <ol>
        {steps.map((step, i) => (
          <li
            key={step.title}
            ref={(el) => {
              items.current[i] = el;
            }}
            data-i={i}
            className={`flex flex-col justify-center py-10 transition-opacity duration-500 lg:min-h-[78vh] lg:py-0 ${
              i === active ? "" : "lg:opacity-25"
            }`}
          >
            <div className="mb-8 lg:hidden">{plate(step)}</div>

            <button
              type="button"
              onClick={() => goTo(i)}
              className="-my-2 self-start py-2 font-mono text-[0.8125rem] tracking-[0.08em] text-star"
            >
              {String(i + 1).padStart(2, "0")}
              <span className="text-star-ghost">
                {" "}
                / {String(steps.length).padStart(2, "0")}
              </span>
            </button>
            <h3 className="mt-5 text-[2.25rem] leading-[1.05] font-medium tracking-[-0.045em] text-balance text-star sm:text-[2.75rem]">
              {step.title}
            </h3>
            <p className="mt-5 max-w-md text-[1.0625rem] leading-relaxed text-pretty text-star-dim">
              {step.body}
            </p>
            <div className="mt-8 max-w-md border-t border-line pt-7">
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <b className="text-[1.75rem] font-medium tracking-[-0.04em] text-star">
                  {step.stat.value}
                </b>
                <span className="font-mono text-[0.75rem] tracking-[0.08em] text-star-dim uppercase">
                  {step.stat.label}
                </span>
              </p>
              <p className="mt-2 font-mono text-[0.75rem] text-star-faint">
                {step.stat.note}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * One thing's journey through the steps as a bar: stages already passed in grey, the current
 * one in white, the ones still ahead stippled.
 */
function ProgressBar({
  steps,
  active,
  label,
}: {
  steps: Step[];
  active: number;
  label: string;
}) {
  return (
    <div aria-hidden="true" className="font-mono text-[0.6875rem] tracking-[0.08em] uppercase">
      <div className="flex justify-between text-star-faint">
        <span>{label}</span>
        <span className="normal-case">illustrative</span>
      </div>
      <div className="mt-3 flex gap-1">
        {steps.map((step, i) => (
          <span
            key={step.stage}
            style={{ flexGrow: step.share }}
            className={`h-2 basis-0 rounded-[1px] transition-colors duration-500 ${
              i === active ? "bg-star" : i < active ? "bg-star-ghost" : "progress-ahead"
            }`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex gap-1">
        {steps.map((step, i) => (
          <span
            key={step.stage}
            style={{ flexGrow: step.share }}
            className={`basis-0 transition-colors duration-500 ${
              i === active ? "text-star" : "text-star-ghost"
            }`}
          >
            {step.stage}
          </span>
        ))}
      </div>
    </div>
  );
}
