import { formatXlm } from "@/lib/stellar/config";
import type { ProtocolStats } from "@/lib/supabase/stats";
import { Reveal } from "./reveal";

/**
 * Protocol numbers, counted from the tables rather than written down. Every
 * value here is live testnet data — the whole deployment, which is what the
 * "Testnet · live" tag beside the heading is there to say.
 *
 * `sold to date` is gross: everything a buyer has paid for, whether or not the
 * contributor has claimed it yet. What has actually reached a contributor's
 * wallet is `paid out`, and the two never share a label.
 */
export function Stats({ stats }: { stats: ProtocolStats }) {
  const count = (n: number) => n.toLocaleString("en-US");

  const metrics = [
    { value: count(stats.contributors), label: "contributors" },
    { value: count(stats.datasets), label: "datasets contributed" },
    { value: count(stats.sales), label: "licences sold" },
    { value: `${formatXlm(stats.grossStroops)} XLM`, label: "sold to date" },
    { value: `${formatXlm(stats.paidStroops)} XLM`, label: "paid out to date" },
    { value: count(stats.payouts), label: "payouts settled on-chain" },
  ];

  const sold = stats.units.filter((u) => u.sold).length;

  return (
    <section className="border-t border-rule bg-paper-raised">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-20">
          <Reveal>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="eyebrow text-ink-faint">The protocol, so far</p>
                <span className="rounded-full border border-rule px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint uppercase">
                  Testnet · live
                </span>
              </div>

              {stats.units.length === 0 ? (
                <p className="mt-6 max-w-sm text-sm text-pretty text-ink-dim">
                  Nothing has been contributed yet. This fills in as the
                  protocol runs, one square per dataset, counted from the
                  ledger rather than typed in.
                </p>
              ) : (
                <>
                  <div
                    className="mt-6 flex flex-wrap gap-[7px]"
                    role="img"
                    aria-label={`Unit chart: ${stats.units.length} squares, one per contributed dataset, of which ${sold} have been licensed.`}
                  >
                    {stats.units.map((unit, i) => (
                      <span
                        key={i}
                        className={`h-[7px] w-[7px] ${
                          unit.sold ? "bg-slate" : "bg-ink/15"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-6 font-mono text-[0.6875rem] text-ink-faint">
                    <span className="mr-1.5 inline-block h-[7px] w-[7px] bg-slate align-middle" />
                    1 square = 1 dataset · accent = licensed at least once
                    {stats.unitsTruncated ? " · first 480 shown" : ""}
                  </p>
                </>
              )}
            </div>
          </Reveal>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule">
            {metrics.map((metric, i) => (
              <Reveal key={metric.label} delay={i * 70}>
                {/* col-reverse: term before definition in the DOM (valid <dl>),
                    value above label on screen. */}
                <div className="flex h-full flex-col-reverse gap-2 bg-paper p-6">
                  <dt className="text-sm text-ink-faint">{metric.label}</dt>
                  <dd className="display text-3xl font-medium text-ink tabular-nums sm:text-4xl">
                    {metric.value}
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
