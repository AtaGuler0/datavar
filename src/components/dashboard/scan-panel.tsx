"use client";

import type { ScanReport } from "@/lib/scan";

/**
 * The scanner's answer, in the contributor's words.
 *
 * A quality filter that says "rejected" and nothing else is a filter people
 * route around or resent, and in this case they would be right to: the check
 * runs on heuristics, and heuristics are wrong sometimes. So every verdict
 * arrives with what was actually read out of the file — the dimensions, the
 * tool named in the metadata, the number of rows — and each flag says what it
 * saw rather than what it concluded.
 *
 * Shared by the upload form and the rescan on an existing dataset, because
 * both have to explain exactly the same thing.
 */
export function ScanPanel({
  report,
  scanning,
  compact = false,
}: {
  report: ScanReport | null;
  scanning: boolean;
  compact?: boolean;
}) {
  if (scanning) {
    return (
      <div className="rounded-xl border border-rule bg-paper-raised/40 px-4 py-3">
        <p className="text-sm text-ink-dim">Checking the file on your device…</p>
      </div>
    );
  }

  if (!report) return null;

  const tone =
    report.status === "rejected"
      ? "border-fall/40 bg-fall/[0.04]"
      : report.status === "flagged"
        ? "border-rule-strong bg-paper-raised/60"
        : "border-rise/30 bg-rise/[0.04]";

  const headline =
    report.status === "rejected"
      ? "This one can't be contributed"
      : report.status === "flagged"
        ? "Kept, with a note against it"
        : "Nothing found against this file";

  return (
    <div className={`rounded-xl border px-4 py-3.5 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-ink">{headline}</p>
        <p className="font-mono text-[0.625rem] text-ink-faint">
          checked on your device
        </p>
      </div>

      {report.facts.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[0.6875rem] text-ink-faint">
          {report.facts.map((fact, i) => (
            <span key={`${fact}-${i}`}>
              {i > 0 && <span className="mr-2">·</span>}
              {fact}
            </span>
          ))}
        </p>
      )}

      {report.flags.length > 0 && (
        <ul className="mt-3 space-y-2.5 border-t border-rule pt-3">
          {report.flags.map((flag) => (
            <li key={flag.id}>
              <p className="text-[0.8125rem] font-medium text-ink">
                {flag.severity === "reject" && (
                  <span className="mr-1.5 text-fall">×</span>
                )}
                {flag.title}
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-pretty text-ink-dim">
                {flag.detail}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!compact && report.status === "clean" && (
        <p className="mt-2 text-xs text-pretty text-ink-faint">
          The check reads what the file says about itself and how much is in it.
          It cannot prove a picture is real, only that nothing in it claims
          otherwise.
        </p>
      )}
    </div>
  );
}
