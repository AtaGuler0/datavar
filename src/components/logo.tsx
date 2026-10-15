/** Cells of the 3×3 crowd that have consented. */
const CONSENTED = new Set([1, 3, 8]);

/**
 * The mark is the product: a 3×3 crowd of contributors where a few have
 * consented. Monochrome like everything else that isn't signal — the
 * consented cells are the ones drawn at full strength and size.
 */
export function Logo() {
  const consented = CONSENTED;
  const base = "var(--color-star)";
  const accent = "var(--color-star)";

  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => {
          const lit = consented.has(i);
          return (
            <rect
              key={i}
              x={2 + (i % 3) * 7}
              y={2 + Math.floor(i / 3) * 7}
              width={lit ? 4 : 3}
              height={lit ? 4 : 3}
              fill={lit ? accent : base}
              opacity={lit ? 1 : 0.28}
            />
          );
        })}
      </svg>
      <span
        className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-star"
      >
        Datavar
      </span>
    </span>
  );
}

/**
 * The same 3×3 crowd drawn as a pixel mark, for display sizes: every cell a
 * square, the consented three lit and the rest faint, with no gap tweaks for
 * the small size. Sits over the hero headline.
 */
export function PixelMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 17 17" className={className} aria-hidden="true">
      {Array.from({ length: 9 }).map((_, i) => (
        <rect
          key={i}
          x={1 + (i % 3) * 6}
          y={1 + Math.floor(i / 3) * 6}
          width={3}
          height={3}
          fill="var(--color-star)"
          opacity={CONSENTED.has(i) ? 1 : 0.22}
        />
      ))}
    </svg>
  );
}
