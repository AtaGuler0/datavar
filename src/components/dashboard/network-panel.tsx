"use client";

import { useEffect, useMemo, useState } from "react";
import { SESSION_NOW } from "@/lib/clock";
import { formatBytes, formatCount, percentDelta } from "@/lib/format";
import { formatXlm } from "@/lib/stellar/config";
import { SOURCE_TYPES } from "@/lib/supabase/datasets";
import { listNetworkDatasets, type NetworkRow } from "@/lib/supabase/network";
import { loadProtocolStats, type ProtocolStats } from "@/lib/supabase/stats";
import { ActivityChart } from "./activity-chart";
import { GrowthCurve, type CurvePoint } from "./growth-curve";
import { Card } from "./primitives";
import { StatCard } from "./stat-card";

const DAY = 86_400_000;

/** Resolution of the contributor curve, regardless of window length. */
const CURVE_POINTS = 24;

const PERIODS = [
  { id: "1d", label: "24H", days: 1, phrase: "last 24 hours" },
  { id: "7d", label: "7D", days: 7, phrase: "last 7 days" },
  { id: "30d", label: "30D", days: 30, phrase: "last 30 days" },
  { id: "all", label: "All", days: null, phrase: "all time" },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

const KNOWN_SOURCES = new Set<string>(SOURCE_TYPES.map((s) => s.id));

export function NetworkPanel() {
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [rows, setRows] = useState<NetworkRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Money comes from the totals view, not the activity rows — a contribution
  // knows its size, not what it later sold for. Loaded separately so a missing
  // view costs the page a few tiles, not the charts.
  const [totals, setTotals] = useState<ProtocolStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    listNetworkDatasets()
      .then((data) => !cancelled && setRows(data))
      .catch(() => !cancelled && setFailed(true));
    loadProtocolStats()
      .then((s) => !cancelled && setTotals(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const config = PERIODS.find((p) => p.id === period)!;

  const stats = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    const now = SESSION_NOW;
    const at = (r: NetworkRow) => new Date(r.created_at).getTime();
    const bytes = (list: NetworkRow[]) =>
      list.reduce((sum, r) => sum + r.byte_size, 0);
    const contributors = (list: NetworkRow[]) =>
      new Set(list.map((r) => r.contributor_id));

    // "All" is still a window — it just starts at the first contribution, so
    // every chart below can share one bucketing path.
    const firstSeenAt = Math.min(...rows.map(at));
    const days =
      config.days ?? Math.max(7, Math.ceil((now - firstSeenAt) / DAY));
    const from = now - days * DAY;

    const cur = rows.filter((r) => at(r) >= from);
    // All-time has no prior window to compare against, so it carries
    // footnotes instead of deltas.
    const prev =
      config.days === null
        ? null
        : rows.filter((r) => at(r) >= from - days * DAY && at(r) < from);

    // When each contributor first showed up — the basis for both the
    // cumulative curve and the "contributors before this window" baseline.
    const firstSeen = new Map<string, number>();
    for (const r of rows) {
      const t = at(r);
      const known = firstSeen.get(r.contributor_id);
      if (known === undefined || t < known) firstSeen.set(r.contributor_id, t);
    }
    const joinedBefore = [...firstSeen.values()].filter((t) => t < from).length;

    const step = (days * DAY) / (CURVE_POINTS - 1);
    const curve: CurvePoint[] = Array.from(
      { length: CURVE_POINTS },
      (_, i) => {
        const t = from + i * step;
        return {
          t,
          value: [...firstSeen.values()].filter((seen) => seen <= t).length,
        };
      },
    );

    const sources = new Set(
      rows.map((r) => r.source_type).filter((id) => KNOWN_SOURCES.has(id)),
    );

    return {
      days,
      rows,
      curve,
      curBytes: bytes(cur),
      prevBytes: prev && bytes(prev),
      datasets: rows.length,
      newDatasets: cur.length,
      contributors: firstSeen.size,
      joinedBefore,
      active: contributors(cur).size,
      activePrev: prev && contributors(prev).size,
      avg: cur.length ? bytes(cur) / cur.length : 0,
      avgPrev: prev && prev.length ? bytes(prev) / prev.length : 0,
      sources: sources.size,
    };
  }, [rows, config]);

  const vs = `vs previous ${config.days ?? 0} days`;

  // The window control rides in the headline card rather than floating on a
  // row of its own — it belongs to the number it changes.
  const windowControl = (
    <div className="flex items-center rounded-full border border-rule bg-paper p-0.5 shadow-sm shadow-ink/[0.03]">
      {PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setPeriod(p.id)}
          aria-pressed={p.id === period}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
            p.id === period
              ? "bg-ink-950 text-chalk"
              : "text-ink-dim hover:text-ink"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  return (
    <section>
      {failed ? (
        <div className="rounded-2xl border border-dashed border-rule-strong bg-paper/60 px-6 py-12 text-center">
          <p className="text-sm text-ink-dim">
            Protocol stats are unavailable right now.
          </p>
        </div>
      ) : !stats ? (
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded-2xl border border-rule bg-paper-raised" />
          <div className="grid gap-3 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-2xl border border-rule bg-paper-raised"
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* The headline: how much data the protocol took in this window. */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
              <div>
                <p className="text-xs text-ink-dim">Data contributed</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
                  <p className="display text-[2.25rem] font-medium tabular-nums text-ink sm:text-[2.75rem]">
                    {formatBytes(stats.curBytes)}
                  </p>
                  {stats.prevBytes !== null && (
                    <DeltaTag
                      value={percentDelta(stats.curBytes, stats.prevBytes)}
                    />
                  )}
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  {config.phrase.charAt(0).toUpperCase() + config.phrase.slice(1)}{" "}
                  · {formatCount(stats.newDatasets)} dataset
                  {stats.newDatasets === 1 ? "" : "s"} from{" "}
                  {formatCount(stats.active)} contributor
                  {stats.active === 1 ? "" : "s"}
                </p>
              </div>
              {windowControl}
            </div>
          </Card>

          {/* When it arrived, and how the contributor base got here. */}
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card
              title="Contributions over time"
              subtitle={`Bytes contributed network-wide, ${config.phrase}`}
            >
              <ActivityChart
                datasets={stats.rows}
                period={stats.days}
                emptyLabel={`No contributions in the ${config.phrase}.`}
              />
            </Card>
            <Card
              title="Contributors"
              subtitle="Wallets that have contributed at least once, cumulative"
            >
              <GrowthCurve
                points={stats.curve}
                format={(v) => formatCount(Math.round(v))}
                unitLabel="contributors"
              />
            </Card>
          </div>

          {/* The standing totals underneath. */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Contributors"
              value={formatCount(stats.contributors)}
              delta={
                config.days === null
                  ? undefined
                  : percentDelta(stats.contributors, stats.joinedBefore)
              }
              deltaLabel={`vs before the ${config.phrase}`}
              footnote={
                config.days === null
                  ? "wallets with at least one contribution"
                  : undefined
              }
            />
            <StatCard
              label="Datasets on file"
              value={formatCount(stats.datasets)}
              delta={
                config.days === null
                  ? undefined
                  : percentDelta(
                      stats.datasets,
                      stats.datasets - stats.newDatasets,
                    )
              }
              deltaLabel={`vs before the ${config.phrase}`}
              footnote={
                config.days === null ? "every contribution to date" : undefined
              }
            />
            <StatCard
              label="Active contributors"
              value={formatCount(stats.active)}
              delta={
                stats.activePrev === null
                  ? undefined
                  : percentDelta(stats.active, stats.activePrev)
              }
              deltaLabel={vs}
              footnote={
                stats.activePrev === null
                  ? "wallets that contributed in this window"
                  : undefined
              }
            />
            <StatCard
              label="Average dataset"
              value={stats.avg ? formatBytes(Math.round(stats.avg)) : "—"}
              delta={
                stats.avgPrev === null
                  ? undefined
                  : percentDelta(stats.avg, stats.avgPrev)
              }
              deltaLabel={vs}
              footnote={
                stats.avgPrev === null
                  ? "mean size of a contribution"
                  : undefined
              }
            />
            <StatCard
              label="Sources covered"
              value={`${stats.sources} of ${SOURCE_TYPES.length}`}
              footnote="source categories with at least one contribution"
            />
            <StatCard
              label="Datasets licensed"
              value={totals === null ? "—" : formatCount(totals.datasetsSold)}
              footnote="bought by at least one buyer"
            />
            {/* Gross and paid sit side by side deliberately: the gap between
                them is money contributors have earned and not yet claimed. */}
            <StatCard
              label="Sold to date"
              value={
                totals === null ? "—" : `${formatXlm(totals.grossStroops)} XLM`
              }
              footnote={
                totals === null
                  ? undefined
                  : `across ${formatCount(totals.sales)} licence${
                      totals.sales === 1 ? "" : "s"
                    }`
              }
            />
            <StatCard
              label="Paid out to date"
              value={
                totals === null ? "—" : `${formatXlm(totals.paidStroops)} XLM`
              }
              footnote="claimed by contributors and settled on-chain"
            />
          </div>
        </>
      )}
    </section>
  );
}

/** The headline's delta, sized up from the one on the stat tiles. */
function DeltaTag({ value }: { value: number | "new" | null }) {
  if (value === null) {
    return <span className="text-sm text-ink-faint">No change</span>;
  }
  if (value === "new") {
    return <span className="text-sm font-medium text-rise">New</span>;
  }
  const up = value >= 0;
  return (
    <span
      className={`flex items-center gap-1.5 text-sm font-medium ${
        up ? "text-rise" : "text-fall"
      }`}
    >
      <svg
        viewBox="0 0 8 8"
        className={`h-2.5 w-2.5 ${up ? "" : "rotate-180"}`}
        aria-hidden="true"
      >
        <path d="M4 1l3.4 6H0.6z" fill="currentColor" />
      </svg>
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
