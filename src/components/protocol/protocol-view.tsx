"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SESSION_NOW } from "@/lib/clock";
import { formatBytes, formatCount } from "@/lib/format";
import { formatAmount, formatXlm, USDC_PER_XLM_LIST } from "@/lib/stellar/config";
import { sourceLabel } from "@/lib/supabase/datasets";
import { listNetworkDatasets, type NetworkRow } from "@/lib/supabase/network";
import { loadProtocolStats, type ProtocolStats } from "@/lib/supabase/stats";
import { ActivityChart } from "../dashboard/activity-chart";
import { GrowthCurve, type CurvePoint } from "../dashboard/growth-curve";
import { Plate } from "../night";
import { Reveal } from "../reveal";
import { DatasetField } from "./dataset-field";

/**
 * The protocol in public, drawn rather than tiled: four standing numbers, the
 * whole of the data on file as one field, when it arrived and who brought
 * it, what it is, and where the money went. Everything is read from the
 * public views; no wallet, and a zero where nothing has happened.
 */

const DAY = 86_400_000;
const CURVE_POINTS = 24;

const PERIODS = [
  { id: "7d", label: "7D", days: 7, phrase: "last 7 days" },
  { id: "30d", label: "30D", days: 30, phrase: "last 30 days" },
  { id: "90d", label: "90D", days: 90, phrase: "last 90 days" },
  { id: "all", label: "All", days: null, phrase: "all time" },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

/**
 * An amount held in two vaults, printed USDC first. The XLM settled before the
 * switch stays its own figure: adding it in would take a rate, and these are
 * the ledger's numbers, not ours.
 */
function money(usdc: number, stroops: number) {
  if (usdc > 0) {
    return {
      amount: formatAmount(usdc, "USDC"),
      unit: "USDC",
      extra: stroops > 0 ? `+ ${formatXlm(stroops)} XLM settled before USDC` : undefined,
    };
  }
  if (stroops > 0) {
    return { amount: formatXlm(stroops), unit: "XLM", extra: "settled before the switch to USDC" };
  }
  return { amount: "0.00", unit: "USDC", extra: undefined };
}

/** One figure in the strip under the heading. */
function Figure({ label, value, note }: { label: string; value: string; note: ReactNode }) {
  return (
    <div className="border-line py-7 pr-4 lg:border-l lg:py-2 lg:pl-8 lg:first:border-l-0 lg:first:pl-0">
      <dt className="font-mono text-[0.75rem] tracking-[0.12em] text-star-faint uppercase">{label}</dt>
      <dd className="mt-4 text-[2.5rem] leading-none font-medium tracking-[-0.05em] text-star tabular-nums sm:text-[3.25rem]">
        {value}
      </dd>
      <dd className="mt-3 text-[0.875rem] leading-relaxed text-star-faint">{note}</dd>
    </div>
  );
}

export function ProtocolView() {
  const [period, setPeriod] = useState<PeriodId>("all");
  const [rows, setRows] = useState<NetworkRow[] | null>(null);
  const [totals, setTotals] = useState<ProtocolStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listNetworkDatasets()
      .then((data) => !cancelled && setRows(data))
      .catch(() => !cancelled && setFailed(true));
    // Separate on purpose: a missing totals view costs the money and the
    // field, not the charts.
    loadProtocolStats()
      .then((s) => !cancelled && setTotals(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const config = PERIODS.find((p) => p.id === period)!;

  const view = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const at = (r: NetworkRow) => new Date(r.created_at).getTime();
    const first = Math.min(...rows.map(at));
    // "All" is a window too, starting at the first contribution.
    const days = config.days ?? Math.max(7, Math.ceil((SESSION_NOW - first) / DAY));
    const from = SESSION_NOW - days * DAY;
    const cur = rows.filter((r) => at(r) >= from);

    const firstSeen = new Map<string, number>();
    for (const r of rows) {
      const t = at(r);
      const known = firstSeen.get(r.contributor_id);
      if (known === undefined || t < known) firstSeen.set(r.contributor_id, t);
    }
    const step = (days * DAY) / (CURVE_POINTS - 1);
    const curve: CurvePoint[] = Array.from({ length: CURVE_POINTS }, (_, i) => {
      const t = from + i * step;
      return { t, value: [...firstSeen.values()].filter((seen) => seen <= t).length };
    });

    const bySource = new Map<string, { count: number; bytes: number }>();
    for (const r of rows) {
      const entry = bySource.get(r.source_type) ?? { count: 0, bytes: 0 };
      entry.count += 1;
      entry.bytes += r.byte_size;
      bySource.set(r.source_type, entry);
    }
    const sources = [...bySource.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count);

    return {
      days,
      curve,
      sources,
      bytes: cur.reduce((sum, r) => sum + r.byte_size, 0),
      count: cur.length,
      active: new Set(cur.map((r) => r.contributor_id)).size,
      contributors: firstSeen.size,
      total: rows.length,
    };
  }, [rows, config]);

  if (failed) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-6 py-16 text-center text-sm text-star-dim">
        Protocol numbers are unavailable right now.
      </p>
    );
  }

  if (!view) {
    return (
      <div aria-busy="true" className="space-y-6">
        <div className="h-36 animate-pulse rounded-xl border border-line bg-night-900/60" />
        <div className="h-[28rem] animate-pulse rounded-xl border border-line bg-night-900/60" />
      </div>
    );
  }

  const sold = money(totals?.grossUsdc ?? 0, totals?.grossStroops ?? 0);
  const paid = money(totals?.paidUsdc ?? 0, totals?.paidStroops ?? 0);
  // Only a proportion for the bar, never printed as an amount: the list rate
  // lines the two vaults up so the claimed share can be drawn as one length.
  // Both vaults count in seven-decimal units, so the rate applies directly.
  const toUsdc = (stroops: number) => stroops * USDC_PER_XLM_LIST;
  const grossAll = totals ? totals.grossUsdc + toUsdc(totals.grossStroops) : 0;
  const paidAll = totals ? totals.paidUsdc + toUsdc(totals.paidStroops) : 0;
  const claimed = grossAll > 0 ? Math.min(paidAll / grossAll, 1) : 0;
  const top = view.sources[0]?.count ?? 1;
  // Half a phone is too narrow for "1,194.75 XLM" on one line, and only the
  // longer of the two figures wrapped. Below sm the unit always takes its own
  // line, so the pair still match.
  const unitClass = "mt-1 block text-[1rem] text-star-dim sm:mt-0 sm:inline";

  return (
    <div>
      <Reveal>
        <dl className="grid grid-cols-2 border-y border-line lg:grid-cols-4 lg:py-8">
          <Figure
            label="Contributors"
            value={formatCount(view.contributors)}
            note="wallets with at least one dataset"
          />
          <Figure
            label="Datasets on file"
            value={formatCount(totals?.datasets ?? view.total)}
            note={`${formatBytes(view.sources.reduce((s, x) => s + x.bytes, 0))} in total`}
          />
          <Figure
            label="Licensed"
            value={totals ? formatCount(totals.datasetsSold) : "—"}
            note={totals ? `across ${formatCount(totals.sales)} licences` : "loading"}
          />
          <Figure
            label="Paid out"
            value={totals ? paid.amount : "—"}
            note={`${paid.unit} · claimed and settled on-chain`}
          />
        </dl>
        {/* These totals count our own load-test traffic. Said here, next to
            the numbers, so they are not read as adoption. */}
        {totals && totals.generatedDatasets !== 0 && (
          <p className="mt-4 max-w-3xl text-[0.8125rem] leading-relaxed text-pretty text-star-faint">
            Testnet only. These totals include a load test we ran ourselves
            {totals.generatedDatasets !== null && totals.generatedSales !== null ? (
              <>
                : {formatCount(totals.generatedDatasets)} of the{" "}
                {formatCount(totals.datasets)} datasets were filed by wallets
                our bot generated, and {formatCount(totals.generatedSales)} of
                the {formatCount(totals.sales)} licences are sales of those
                datasets
              </>
            ) : (
              " with wallets our bot generated"
            )}
            . Those rows are our own traffic, not outside adoption.
          </p>
        )}
      </Reveal>

      {totals && totals.units.length > 0 && (
        <Reveal delay={80}>
          <Plate
            fig="Fig 0.1"
            tag="Every dataset"
            className="mt-16"
            bodyClassName="px-2 sm:px-10"
            caption={
              <>
                <span>One block per dataset · oldest at the back</span>
                <span>
                  {totals.unitsTruncated
                    ? `First ${formatCount(totals.units.length)} drawn`
                    : "Raised: licensed"}
                </span>
              </>
            }
          >
            {/* Clipped on a phone, where the field crops itself to fit;
                scrolls from sm up, where it keeps its callouts. */}
            <div className="overflow-hidden sm:overflow-x-auto sm:overscroll-x-contain">
              <DatasetField
                units={totals.units}
                total={totals.datasets}
                sold={totals.datasetsSold}
              />
            </div>
          </Plate>
        </Reveal>
      )}

      {/* When it arrived and who brought it, on one window. */}
      <div className="mt-24 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="font-mono text-[0.75rem] tracking-[0.12em] text-star-faint uppercase">
            Arrivals · {config.phrase}
          </p>
          <p className="mt-4 text-[1.75rem] leading-tight font-medium tracking-[-0.035em] sm:text-[2.05rem]">
            <span className="text-star">{formatBytes(view.bytes)} contributed.</span>{" "}
            <span className="text-star-faint">
              {formatCount(view.count)} dataset{view.count === 1 ? "" : "s"} from{" "}
              {formatCount(view.active)} contributor{view.active === 1 ? "" : "s"}.
            </span>
          </p>
        </div>
        <div role="group" aria-label="Window" className="flex rounded-[12px] border border-line p-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              aria-pressed={p.id === period}
              className={`rounded-[8px] px-3.5 py-2.5 font-mono text-[0.75rem] tracking-[0.08em] uppercase transition-colors sm:py-1.5 ${
                p.id === period ? "bg-star text-night" : "text-star-faint hover:text-star"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Plate fig="Fig 0.2" tag="Bytes in" bodyClassName="px-5 pt-5 pb-5">
          <ActivityChart
            datasets={rows!}
            period={view.days}
            emptyLabel={`Nothing contributed in the ${config.phrase}.`}
          />
        </Plate>
        <Plate fig="Fig 0.3" tag="Contributors, cumulative" bodyClassName="px-5 pt-5 pb-5">
          <GrowthCurve
            points={view.curve}
            format={(v) => formatCount(Math.round(v))}
            unitLabel="contributors"
          />
        </Plate>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* What it is: every category, longest bar first. */}
        <Plate fig="Fig 0.4" tag="By source" bodyClassName="px-5 pt-6 pb-5 sm:px-6">
          <ul className="space-y-4">
            {view.sources.map((s) => (
              <li key={s.id}>
                <div className="flex items-baseline justify-between gap-4 text-[0.875rem]">
                  <span className="text-star">{sourceLabel(s.id)}</span>
                  <span className="font-mono text-[0.75rem] text-star-faint tabular-nums">
                    {formatCount(s.count)} · {formatBytes(s.bytes)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-line">
                  <div className="h-full bg-star" style={{ width: `${(s.count / top) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Plate>

        {/* Where the money went: sold, and how much of it has been claimed. */}
        <Plate fig="Fig 0.5" tag="Money" bodyClassName="flex flex-col px-5 pt-6 pb-5 sm:px-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="font-mono text-[0.75rem] tracking-[0.12em] text-star-faint uppercase">Sold</p>
              <p className="mt-3 text-[1.75rem] leading-none font-medium tracking-[-0.04em] text-star tabular-nums">
                {sold.amount} <span className={unitClass}>{sold.unit}</span>
              </p>
              {sold.extra && <p className="mt-2 text-[0.8125rem] text-star-faint">{sold.extra}</p>}
            </div>
            <div>
              <p className="font-mono text-[0.75rem] tracking-[0.12em] text-star-faint uppercase">Paid out</p>
              <p className="mt-3 text-[1.75rem] leading-none font-medium tracking-[-0.04em] text-star tabular-nums">
                {paid.amount} <span className={unitClass}>{paid.unit}</span>
              </p>
              {paid.extra && <p className="mt-2 text-[0.8125rem] text-star-faint">{paid.extra}</p>}
            </div>
          </div>

          <div className="pt-10">
            <div className="flex h-10 overflow-hidden rounded-md border border-line-strong">
              <div className="h-full bg-star" style={{ width: `${claimed * 100}%` }} />
              <div className="progress-ahead h-full flex-1" />
            </div>
            <div className="mt-3 flex justify-between gap-4 font-mono text-[0.6875rem] tracking-[0.08em] text-star-faint uppercase">
              <span className="whitespace-nowrap">Claimed · {Math.round(claimed * 100)}%</span>
              <span className="text-right">Earned, not yet claimed</span>
            </div>
          </div>

          {totals && (
            <dl className="mt-8 divide-y divide-line border-t border-line text-[0.875rem]">
              {[
                ["Licences sold", formatCount(totals.sales)],
                ["Datasets licensed", `${formatCount(totals.datasetsSold)} of ${formatCount(totals.datasets)}`],
                ["Payouts settled", formatCount(totals.payouts)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-star-faint">{label}</dt>
                  <dd className="font-mono text-[0.8125rem] text-star tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Plate>
      </div>
    </div>
  );
}
