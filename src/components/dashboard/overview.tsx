"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SESSION_NOW } from "@/lib/clock";
import { formatBytes, formatDate, percentDelta } from "@/lib/format";
import {
  addMoney,
  emptyMoney,
  formatMoney,
  moneyTotal,
  truncateAddress,
} from "@/lib/stellar/config";
import {
  listDatasets,
  SOURCE_TYPES,
  type Dataset,
} from "@/lib/supabase/datasets";
import {
  earnedStroops,
  listSalesForWallet,
  type SaleWithDataset,
} from "@/lib/supabase/sales";
import { ActivityChart } from "./activity-chart";
import { ConnectPanel } from "./connect-panel";
import { InsightCard } from "./insight-card";
import { CONTRIBUTOR_NAV } from "./nav-config";
import { Arrow, Segmented } from "../night";
import { Card, PageHeading } from "./primitives";
import { RecentUploads } from "./recent-uploads";
import { SourceShare } from "./source-share";
import { StatCard } from "./stat-card";
import { useWallet } from "./wallet-provider";

const DAY = 86_400_000;
const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

/** Trend resolution on the stat tiles, regardless of period length. */
const SPARK_POINTS = 12;

const SECTIONS = CONTRIBUTOR_NAV.filter((s) => s.href !== "/dashboard");

/**
 * Time-of-day greeting, resolved only on the client — the page is prerendered,
 * so reading the clock during render would hydrate against the build's hour.
 */
function useGreeting() {
  const [greeting, setGreeting] = useState("Welcome back");
  useEffect(() => {
    // Deferred to a frame: setState in an effect body cascades renders.
    const raf = requestAnimationFrame(() => {
      const h = new Date().getHours();
      setGreeting(
        h < 5
          ? "Still up"
          : h < 12
            ? "Good morning"
            : h < 18
              ? "Good afternoon"
              : "Good evening",
      );
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  return greeting;
}

export function Overview() {
  const { address, status, session } = useWallet();
  const greeting = useGreeting();
  const [period, setPeriod] = useState<Period>(30);

  // Keyed by wallet so a disconnect or switch never shows another account's
  // rows — deriving instead of resetting keeps the effect free of setState.
  const [loaded, setLoaded] = useState<{
    wallet: string;
    rows: Dataset[];
    sales: SaleWithDataset[];
  } | null>(null);

  // Waits for the session, not just the address. Row-level security answers a
  // sessionless read with zero rows rather than an error, so running this early
  // would report "no datasets on file" — a confident wrong answer — and the
  // token arriving later would not have refetched it.
  const token = session?.token;
  useEffect(() => {
    if (!address || !token) return;
    let cancelled = false;
    // Datasets and their sales land together: the payout tile reads the same
    // ledger the earnings page does, so one arriving without the other would
    // put a stale total next to fresh uploads. Either half failing degrades to
    // empty rather than taking the page down.
    Promise.all([
      listDatasets(address).catch(() => [] as Dataset[]),
      listSalesForWallet(address).catch(() => [] as SaleWithDataset[]),
    ]).then(
      ([rows, sales]) => !cancelled && setLoaded({ wallet: address, rows, sales }),
    );
    return () => {
      cancelled = true;
    };
  }, [address, token]);

  const current = address && token && loaded?.wallet === address ? loaded : null;
  const datasets = current?.rows ?? null;
  const sales = current?.sales ?? null;
  const connected = status === "connected" && !!address && !!token;

  const stats = useMemo(() => {
    if (!datasets || !sales) return null;

    const now = SESSION_NOW;
    const between = (d: Dataset, from: number, to: number) => {
      const t = new Date(d.created_at).getTime();
      return t >= from && t < to;
    };
    const bytes = (list: Dataset[]) =>
      list.reduce((sum, d) => sum + d.byte_size, 0);

    const cur = datasets.filter((d) => between(d, now - period * DAY, now + 1));
    const prev = datasets.filter((d) =>
      between(d, now - 2 * period * DAY, now - period * DAY),
    );

    const sources = new Set(datasets.map((d) => d.source_type));

    // What the data actually earned, straight off the sales ledger — the same
    // stroops the earnings page claims against, not a rate-card estimate.
    // Per asset: a contributor paid in both has two figures, and adding them
    // would need a rate nothing here has.
    const money = (rows: typeof sales) =>
      rows.reduce(
        (total, sale) =>
          addMoney(total, sale.asset ?? "XLM", earnedStroops(sale)),
        emptyMoney(),
      );
    const earned = money(sales);
    const claimable = money(sales.filter((s) => s.status === "unclaimed"));

    // Daily-ish buckets for the trend line: the period split into 12 slices.
    const slice = (period * DAY) / SPARK_POINTS;
    const spark = Array.from({ length: SPARK_POINTS }, (_, i) => {
      const from = now - period * DAY + i * slice;
      return bytes(datasets.filter((d) => between(d, from, from + slice)));
    });

    return {
      total: datasets.length,
      lastUpload: datasets[0]?.created_at, // listDatasets orders newest first
      curCount: cur.length,
      prevCount: prev.length,
      curBytes: bytes(cur),
      prevBytes: bytes(prev),
      sources: sources.size,
      earned,
      claimable,
      salesCount: sales.length,
      spark,
    };
  }, [datasets, sales, period]);

  return (
    <div>
      {/* Greeting and account identity in one block. This page is your account
          now — the protocol-wide view moved to /protocol, because arriving at
          your own dashboard and scrolling into someone else's numbers made
          neither half legible. */}
      <PageHeading
        eyebrow="Contributor · Overview"
        title={`${greeting}.`}
        aside={connected ? "Here is where your data stands." : "Sign in and your data is here."}
        action={
          connected ? (
            <Segmented
              label="Period"
              options={PERIODS.map((p) => ({ id: p, label: `${p}D` }))}
              value={period}
              onChange={setPeriod}
            />
          ) : undefined
        }
      />
      {connected && stats && (
        <p className="mt-4 font-mono text-[0.75rem] tracking-[0.06em] text-star-faint uppercase">
          <span className="text-star-dim">{truncateAddress(address)}</span> ·{" "}
          {stats.total} dataset{stats.total === 1 ? "" : "s"} on file
          {stats.lastUpload && <> · last upload {formatDate(stats.lastUpload)}</>}
        </p>
      )}

      {/* Account state: KPIs when connected, the connect block when not. */}
      {status === "loading" ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border border-line bg-white/[0.02]"
            />
          ))}
        </div>
      ) : !connected ? (
        <div className="mt-10">
          <ConnectPanel />
        </div>
      ) : stats === null ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border border-line bg-white/[0.02]"
            />
          ))}
        </div>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Earned"
            value={formatMoney(stats.earned)}
            footnote={
              stats.salesCount === 0
                ? "nothing sold yet"
                : moneyTotal(stats.claimable) > 0
                  ? `${formatMoney(stats.claimable)} waiting to be claimed`
                  : `across ${stats.salesCount} sale${stats.salesCount === 1 ? "" : "s"}, all paid out`
            }
          />
          <StatCard
            label="Datasets contributed"
            value={String(stats.curCount)}
            delta={percentDelta(stats.curCount, stats.prevCount)}
            deltaLabel={`vs previous ${period} days`}
          />
          <StatCard
            label="Data contributed"
            value={formatBytes(stats.curBytes)}
            delta={percentDelta(stats.curBytes, stats.prevBytes)}
            deltaLabel={`vs previous ${period} days`}
            spark={stats.spark}
          />
          <StatCard
            label="Sources covered"
            value={`${stats.sources} of ${SOURCE_TYPES.length}`}
            footnote="source categories with at least one upload"
          />
        </div>
      )}

      {/* The charts row — when over time on the left, from where on the right. */}
      {connected && datasets && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Card
            title="Contributions over time"
            subtitle={`Bytes contributed per ${period === 90 ? "week" : "day"}`}
          >
            <ActivityChart datasets={datasets} period={period} />
          </Card>
          <Card
            title="Share by source"
            subtitle={`Of data contributed, last ${period} days`}
          >
            <SourceShare datasets={datasets} period={period} />
          </Card>
        </div>
      )}

      {/* Bottom row — the ledger on the left, what to do next on the right. */}
      {connected && datasets && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Card
            title="Recent uploads"
            subtitle="Your latest contributions, newest first"
          >
            <RecentUploads datasets={datasets} />
          </Card>
          <InsightCard datasets={datasets} />
        </div>
      )}

      {/* Section index — a map of the rooms, for before you've signed in.
          Once connected, the rail and the cards above cover it. */}
      {!connected && status !== "loading" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group relative rounded-xl border border-line p-6 transition-colors hover:border-line-strong hover:bg-white/[0.018]"
            >
              <span className="flex items-center justify-between font-mono text-[0.75rem] tracking-[0.1em] text-star-faint uppercase">
                <span>
                  <span className="mr-3 text-star-ghost">{section.index}</span>
                  {section.label}
                </span>
                <Arrow className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
              <span className="mt-4 block text-[0.9375rem] leading-relaxed text-pretty text-star-dim">
                {section.summary}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* The way out to the protocol-wide view, which used to be the top half
          of this page. A line, not a panel: it is context, not your account. */}
      <Link
        href="/protocol"
        className="group mt-12 flex items-center justify-between gap-4 border-t border-line pt-6 text-[0.9375rem] text-star-dim transition-colors hover:text-star"
      >
        <span>Everything contributed across Datavar, counted in public.</span>
        <span className="inline-flex items-center gap-2 font-mono text-[0.75rem] tracking-[0.08em] uppercase">
          Protocol
          <Arrow className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </Link>
    </div>
  );
}
