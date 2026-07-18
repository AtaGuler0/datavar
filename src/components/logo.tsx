/**
 * The mark is the product: a 3×3 crowd of contributors where a few have
 * consented (accent). Same idea as the hero, compressed to 20px.
 */
export function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  const consented = new Set([1, 3, 8]);
  const base = tone === "dark" ? "var(--color-chalk)" : "var(--color-ink)";
  const accent =
    tone === "dark" ? "var(--color-slate-soft)" : "var(--color-slate)";

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
        className={`text-[0.9375rem] font-semibold tracking-[-0.01em] ${
          tone === "dark" ? "text-chalk" : "text-ink"
        }`}
      >
        Datavar
      </span>
    </span>
  );
}
