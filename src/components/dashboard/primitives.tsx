import type { ReactNode } from "react";

/** Brighter ticks over a frame's corners, as on the landing page's plates. */
const CORNERS = [
  "-top-px -left-px rounded-tl-xl border-t border-l",
  "-top-px -right-px rounded-tr-xl border-t border-r",
  "-bottom-px -left-px rounded-bl-xl border-b border-l",
  "-bottom-px -right-px rounded-br-xl border-b border-r",
];

export function Corners() {
  return (
    <>
      {CORNERS.map((corner) => (
        <span
          key={corner}
          aria-hidden="true"
          className={`pointer-events-none absolute h-2.5 w-2.5 border-star-faint ${corner}`}
        />
      ))}
    </>
  );
}

/**
 * The header every app page opens with, in the landing page's grammar: a
 * mono eyebrow with the section's place in the product, then a two-tone
 * title — the claim in white, an optional consequence in grey — and a short
 * line under it.
 */
export function PageHeading({
  eyebrow,
  title,
  aside,
  description,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  /** The grey second half of the title. */
  aside?: ReactNode;
  description?: string;
  /** Pinned to the right of the title on wide screens. */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
      <div className="min-w-0">
        <p className="font-mono text-[0.75rem] tracking-[0.12em] text-star-faint uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-5 -ml-[0.03em] max-w-3xl text-[2rem] leading-[1.05] font-medium tracking-[-0.045em] text-balance sm:text-[2.75rem]">
          <span className="text-star">{title}</span>
          {aside && (
            <>
              {" "}
              <span className="text-star-faint">{aside}</span>
            </>
          )}
        </h1>
        {description && (
          <p className="mt-5 max-w-xl text-[0.9375rem] leading-relaxed text-pretty text-star-dim">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * The app's unit of surface, drawn like the landing page's plates: a
 * hairline frame a shade lighter than the panel, ticks on the corners, and a
 * header in the drawing's mono — the title as its label, the subtitle in
 * plain text under it, an optional action on the right.
 */
export function Card({
  title,
  subtitle,
  action,
  className = "",
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`relative rounded-xl border border-line bg-white/[0.018] ${className}`}
    >
      <Corners />
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-4">
          <div className="min-w-0">
            {title && (
              <h2 className="font-mono text-[0.6875rem] tracking-[0.1em] text-star-dim uppercase">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1.5 text-[0.8125rem] text-star-faint">{subtitle}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={title || action ? "px-5 pb-5 pt-4" : "p-5"}>
        {children}
      </div>
    </section>
  );
}

/**
 * Placeholder for a section that's been routed but not yet built out. Honest
 * about being empty rather than dressing up invented numbers.
 */
export function EmptyState({
  label = "In progress",
  title,
  note,
}: {
  label?: string;
  title: string;
  note?: string;
}) {
  return (
    <div className="mt-10 rounded-xl border border-dashed border-line-strong px-6 py-16 text-center">
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-star-faint">
        {label}
      </p>
      <p className="mt-3 text-pretty text-ink-dim">{title}</p>
      {note && (
        <p className="mx-auto mt-2 max-w-sm text-pretty text-sm text-ink-faint">
          {note}
        </p>
      )}
    </div>
  );
}
