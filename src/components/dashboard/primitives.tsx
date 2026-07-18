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
    <div className="mt-10 rounded-2xl border border-dashed border-rule-strong bg-paper-raised/50 px-6 py-16 text-center">
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
