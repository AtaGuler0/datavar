import { Card } from "./primitives";

/**
 * A 12-point trend in the de-emphasised accent, current position dotted in
 * the full-strength one. Renders nothing until there are at least two points
 * of actual signal — a flat zero line is noise dressed as data.
 */
function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(...points);
  if (points.length < 2 || max === 0) return null;

  const W = 96;
  const H = 28;
  const PAD = 3;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const d = points
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-24 shrink-0" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="var(--color-slate-soft)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={x(points.length - 1)}
        cy={y(points[points.length - 1])}
        r="2.5"
        fill="var(--color-slate)"
      />
    </svg>
  );
}

function DeltaArrow({ up }: { up: boolean }) {
  return (
    <svg
      viewBox="0 0 8 8"
      className={`h-2 w-2 ${up ? "" : "rotate-180"}`}
      aria-hidden="true"
    >
      <path d="M4 1l3.4 6H0.6z" fill="currentColor" />
    </svg>
  );
}

/**
 * One KPI on the overview. `delta` is percent change against the named
 * previous period; `"new"` means there was no prior-period baseline to
 * compare against; `null` means no movement either side. Cards without a
 * meaningful comparison carry a `footnote` instead.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  spark,
  footnote,
}: {
  label: string;
  value: string;
  delta?: number | "new" | null;
  deltaLabel?: string;
  spark?: number[];
  footnote?: string;
}) {
  return (
    <Card>
      <p className="text-xs text-ink-dim">{label}</p>

      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-[1.75rem] font-semibold leading-none text-ink">
          {value}
        </p>
        {spark && <Sparkline points={spark} />}
      </div>

      {delta !== undefined && (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs">
          {delta === null ? (
            <span className="text-ink-faint">— {deltaLabel}</span>
          ) : delta === "new" ? (
            <>
              <span className="font-medium text-rise">New</span>
              <span className="text-ink-faint">{deltaLabel}</span>
            </>
          ) : (
            <>
              <span
                className={`flex items-center gap-1 font-medium ${
                  delta >= 0 ? "text-rise" : "text-fall"
                }`}
              >
                <DeltaArrow up={delta >= 0} />
                {Math.abs(delta).toFixed(1)}%
              </span>
              <span className="text-ink-faint">{deltaLabel}</span>
            </>
          )}
        </p>
      )}

      {footnote && <p className="mt-2.5 text-xs text-ink-faint">{footnote}</p>}
    </Card>
  );
}
