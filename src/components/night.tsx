import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal } from "./reveal";

/**
 * The small vocabulary every night section is built from: one button, one
 * label style, one heading, one frame. Kept together so a section never has
 * to invent its own version of any of them.
 */

/** The primary button: a white pill carrying a small square chip. */
export function PillLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group inline-flex h-11 items-center gap-3 rounded-[14px] bg-star pr-1.5 pl-4 text-sm font-medium text-night transition-colors duration-200 hover:bg-white ${className}`}
    >
      {children}
      <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-night/[0.07] text-night/60 transition-colors duration-200 group-hover:text-night">
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path
            d="M3 8h10M9 4l4 4-4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Link>
  );
}

/** PillLink's look on a button, for actions that don't navigate. */
export function PillButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group inline-flex h-11 items-center gap-3 rounded-[14px] bg-star pr-1.5 pl-4 text-sm font-medium text-night transition-colors duration-200 hover:bg-white disabled:opacity-60 ${className}`}
    >
      {children}
      <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-night/[0.07] text-night/60 transition-colors duration-200 group-hover:text-night">
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}

/** A quieter companion to the pill: hairline, same height. */
export const ghostButton =
  "inline-flex h-11 items-center rounded-[14px] border border-line-strong px-4 text-sm text-star-dim transition-colors duration-200 hover:border-star-faint hover:text-star disabled:opacity-60";

/** Segmented mono control, e.g. a period or currency switch. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-[12px] border border-line p-1">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={o.id === value}
          className={`rounded-[8px] px-3 py-1.5 font-mono text-[0.75rem] tracking-[0.08em] uppercase transition-colors ${
            o.id === value ? "bg-star text-night" : "text-star-faint hover:text-star"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** North-east arrow: "this leaves the section". */
export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M5 11l6-6M6 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mono label over a section: "DATAVAR │ EARNINGS". */
export function Eyebrow({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-[0.8125rem] tracking-[0.1em] text-star-faint uppercase ${className}`}
    >
      Datavar
      <span aria-hidden="true" className="mx-3 text-star-ghost">
        │
      </span>
      {children}
    </p>
  );
}

/**
 * A section heading in two sentences: the claim in white, the consequence in
 * grey underneath. The grey half is what makes it read as an argument rather
 * than a slogan, so it is required.
 */
export function NightHeading({
  eyebrow,
  title,
  aside,
  size = "md",
  className = "",
}: {
  eyebrow: string;
  title: ReactNode;
  aside: ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={className}>
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
      <Reveal delay={60}>
        <h2
          className={`mt-6 font-medium text-balance ${
            size === "lg"
              ? "text-[2.5rem] leading-[1.02] tracking-[-0.05em] sm:text-6xl lg:text-[5.75rem]"
              : "text-[1.75rem] leading-[1.12] tracking-[-0.035em] sm:text-[2.05rem]"
          }`}
        >
          <span className="text-star">{title}</span>{" "}
          <span className="text-star-faint">{aside}</span>
        </h2>
      </Reveal>
    </div>
  );
}

/** Brighter ticks laid over the frame's corners, sitting on its border. */
const CORNERS = [
  "-top-px -left-px rounded-tl-xl border-t border-l",
  "-top-px -right-px rounded-tr-xl border-t border-r",
  "-bottom-px -left-px rounded-bl-xl border-b border-l",
  "-bottom-px -right-px rounded-br-xl border-b border-r",
];

/**
 * A drawing plate: hairline frame, corner ticks, a figure number top left and
 * a tag top right, an optional caption along the bottom. Borrowed from the
 * engineering drawing, where the frame is what tells you the picture inside
 * is a specification and not a decoration.
 */
export function Plate({
  fig,
  tag,
  caption,
  children,
  className = "",
  bodyClassName = "",
}: {
  fig: ReactNode;
  tag: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <figure
      className={`relative rounded-xl border border-line bg-night-900/60 ${className}`}
    >
      {CORNERS.map((corner) => (
        <span
          key={corner}
          aria-hidden="true"
          className={`pointer-events-none absolute h-3 w-3 border-star-faint ${corner}`}
        />
      ))}
      <div className="flex items-center justify-between gap-4 px-5 pt-4 font-mono text-[0.6875rem] tracking-[0.08em] text-star-ghost uppercase">
        <span>{fig}</span>
        <span>{tag}</span>
      </div>
      <div className={bodyClassName}>{children}</div>
      {caption && (
        <figcaption className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4 font-mono text-[0.6875rem] tracking-[0.08em] text-star-ghost uppercase">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
