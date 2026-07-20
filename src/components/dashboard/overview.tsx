"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SESSION_NOW } from "@/lib/clock";
import { formatBytes, formatDate } from "@/lib/format";
import { truncateAddress } from "@/lib/stellar/config";
import {
  listDatasets,
  SOURCE_TYPES,
  type Dataset,
} from "@/lib/supabase/datasets";
import { SOURCE_RATES } from "@/lib/rates";
import { ActivityChart } from "./activity-chart";
import { ConnectPanel } from "./connect-panel";
import { InsightCard } from "./insight-card";
import { CONTRIBUTOR_NAV } from "./nav-config";
import { Card } from "./primitives";
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

/** Percent change, or "new" when there's no prior baseline to compare against. */
function delta(cur: number, prev: number): number | "new" | null {
  if (prev === 0) return cur === 0 ? null : "new";
  return ((cur - prev) / prev) * 100;
}

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
  const { address, status } = useWallet();
  const greeting = useGreeting();
  const [period, setPeriod] = useState<Period>(30);

  // Keyed by wallet so a disconnect or switch never shows another account's
  // rows — deriving instead of resetting keeps the effect free of setState.
  const [loaded, setLoaded] = useState<{
    wallet: string;
    rows: Dataset[];
  } | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    listDatasets(address)
      .then((rows) => !cancelled && setLoaded({ wallet: address, rows }))
      .catch(() => !cancelled && setLoaded({ wallet: address, rows: [] }));
    return () => {
      cancelled = true;
    };
  }, [address]);

  const datasets =
    address && loaded?.wallet === address ? loaded.rows : null;
  const connected = status === "connected" && !!address;

  const stats = useMemo(() => {
    if (!datasets) return null;

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
    const projected = [...sources].reduce(
      (sum, id) => sum + (SOURCE_RATES[id] ?? 0),
      0,
    );

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
      projected,
      spark,
    };
  }, [datasets, period]);

  return (
    <div>
      {/* Greeting row — identity on the left, period control on the right. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="eyebrow text-ink-faint">Overview</p>
          <h1 className="display mt-3 text-[1.75rem] font-medium text-ink sm:text-[2rem]">
            {greeting}.
          </h1>
          <p className="mt-2.5 text-sm text-ink-dim">
            {connected && stats ? (
              <>
                <span className="font-mono text-xs tabular-nums">
                  {truncateAddress(address)}
                </span>{" "}
                · {stats.total} dataset{stats.total === 1 ? "" : "s"} on file
                {stats.lastUpload && (
                  <> · last upload {formatDate(stats.lastUpload)}</>
                )}
              </>
            ) : (
              "Everything here is keyed to your Stellar wallet — connect one to load your account."
            )}
          </p>
        </div>

        {connected && (
          <div className="flex items-center rounded-full border border-rule bg-paper p-0.5 shadow-sm shadow-ink/[0.03]">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                aria-pressed={p === period}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  p === period
                    ? "bg-ink-950 text-chalk"
                    : "text-ink-dim hover:text-ink"
                }`}
              >
                {p} days
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Account state: KPIs when connected, the connect block when not. */}
      {status === "loading" ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-rule bg-paper-raised"
            />
          ))}
        </div>
      ) : !connected ? (
        <div className="mt-8">
          <ConnectPanel />
        </div>
      ) : stats === null ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-rule bg-paper-raised"
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Projected payout"
            value={`$${stats.projected.toFixed(2)}`}
            footnote="per month — an estimate, not a promise"
          />
          <StatCard
            label="Datasets contributed"
            value={String(stats.curCount)}
            delta={delta(stats.curCount, stats.prevCount)}
            deltaLabel={`vs previous ${period} days`}
          />
          <StatCard
            label="Data contributed"
            value={formatBytes(stats.curBytes)}
            delta={delta(stats.curBytes, stats.prevBytes)}
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
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
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
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
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
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group flex items-start gap-4 rounded-xl border border-rule bg-paper p-5 shadow-sm shadow-ink/[0.03] transition-colors hover:border-rule-strong"
          >
            <span className="mt-0.5 font-mono text-xs tabular-nums text-ink-faint">
              {section.index}
            </span>
            <span className="flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                {section.label}
                <svg
                  viewBox="0 0 16 16"
                  className="h-3 w-3 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M6 3l5 5-5 5" strokeLinecap="round" />
                </svg>
              </span>
              <span className="mt-1 block text-sm text-pretty text-ink-dim">
                {section.summary}
              </span>
            </span>
          </Link>
          ))}
        </div>
      )}
    </div>
  );
}
