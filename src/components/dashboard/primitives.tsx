import type { ReactNode } from "react";

/**
 * The header every dashboard section opens with. Smaller than the marketing
 * SectionHeading, but the same grammar: mono eyebrow, tight display title,
 * dimmed body.
 */
export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
}) {
  return (
    <div>
      <p className="eyebrow text-ink-faint">{eyebrow}</p>
      <h1 className="display mt-3 text-[1.75rem] font-medium text-balance text-ink sm:text-[2.25rem]">
        {title}
      </h1>
      {description && (
        <p className="mt-4 max-w-xl text-pretty text-ink-dim">{description}</p>
      )}
    </div>
  );
}

/**
 * The dashboard's unit of surface: a raised paper panel. Give it a title and
 * it grows the standard header row — small ink title, faint subtitle, and an
 * optional action slot pinned to the right.
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
      className={`rounded-2xl border border-rule bg-paper shadow-sm shadow-ink/[0.03] ${className}`}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            {title && <h2 className="text-sm font-medium text-ink">{title}</h2>}
            {subtitle && (
              <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>
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
    <div className="mt-10 rounded-2xl border border-dashed border-rule-strong bg-paper/60 px-6 py-16 text-center">
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint">
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
