import { STAGES, type Reached } from "@/lib/lifecycle";

/**
 * A dataset's four milestones as one line: hashed, consented, licensed, paid.
 *
 * The point of it is that these used to be four different screens with nothing
 * connecting them. Drawing them as a single track says the thing the interface
 * never did — that a file, a receipt and a payout are stages of one object, and
 * that a dataset stalled at the second dot is stalled for a reason worth
 * reading.
 *
 * A reached dot is filled; the rest are outlines. The connecting rule fills
 * only as far as progress actually got, so the strip is legible at a glance
 * without reading a single label.
 */

const LABELS: Record<string, string> = {
  hashed: "Hashed",
  consented: "Consent",
  licensed: "Licensed",
  paid: "Paid",
};

export function LifecycleStrip({ reached }: { reached: Reached }) {
  // How far the filled rule runs: to the last dot that was actually reached.
  // Milestones are ordered, so the first gap ends the run — a paid dataset
  // whose consent was later revoked still shows a continuous track, because it
  // did pass through every stage.
  const lastReached = STAGES.reduce(
    (last, stage, i) => (reached[stage] ? i : last),
    0,
  );

  return (
    <div className="flex items-start">
      {STAGES.map((stage, i) => {
        const last = i === STAGES.length - 1;
        return (
          // Dot and label live in the same cell, so the label is always under
          // its own dot. Laying them out as two sibling rows drifts: the first
          // label takes its natural width while the first dot takes none.
          <div
            key={stage}
            className={last ? "shrink-0" : "min-w-0 flex-1"}
          >
            <div className="flex items-center">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${
                  reached[stage] ? "bg-slate" : "border border-rule-strong bg-paper"
                }`}
              />
              {!last && (
                <span
                  aria-hidden="true"
                  className={`h-px flex-1 ${
                    i < lastReached ? "bg-slate-soft" : "bg-rule-strong"
                  }`}
                />
              )}
            </div>
            <span
              className={`mt-2 block font-mono text-[0.625rem] uppercase tracking-[0.1em] ${
                reached[stage] ? "text-ink-dim" : "text-ink-faint"
              }`}
            >
              {LABELS[stage]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
