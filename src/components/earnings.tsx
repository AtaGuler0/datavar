"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatXlm, STROOPS_PER_XLM } from "@/lib/stellar/config";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

/**
 * What a contributor might earn. The rates are not ours to invent: each one is
 * the average price a dataset in that category has actually settled for on
 * testnet, passed in from the sales table. A category nobody has licensed yet
 * has no rate, and the estimator says so rather than filling the gap.
 */

/** Source categories, mirroring SOURCE_TYPES in lib/supabase/datasets. */
const SOURCES = [
  { id: "browsing", label: "Browsing & search" },
  { id: "purchases", label: "Purchase history" },
  { id: "health", label: "Health & wearables" },
  { id: "location", label: "Location trails" },
  { id: "media", label: "Streaming & media" },
  { id: "voice", label: "Voice samples" },
  { id: "messaging", label: "Messaging metadata" },
  { id: "dashcam", label: "Dashcam & camera" },
];

/** Which checkboxes start ticked. A UI default, not a claim about anything. */
const DEFAULT_ON = ["browsing", "purchases", "media"];

/**
 * How a payout can leave the protocol. XLM is the only one that exists — the
 * claim route settles it on Stellar — so it is the only one that is selectable.
 * PayPal is listed because it is planned, and marked so nobody reads it as
 * shipped.
 */
const PAYOUTS = [
  { id: "xlm", label: "XLM", note: "Instant · network fee", ready: true },
  { id: "paypal", label: "PayPal", note: "Soon", ready: false },
];

/** Eases a number toward its target so the total never snaps. */
function useTween(target: number) {
  const [value, setValue] = useState(target);
  const raf = useRef(0);
  // Mirrors `value` so the effect can read the current position without
  // depending on it — depending on it would restart the tween every frame.
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    const delta = target - from;
    if (Math.abs(delta) < 0.005) return;

    const commit = (next: number) => {
      current.current = next;
      setValue(next);
    };

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduced) {
      // Still deferred to a frame: setState in an effect body cascades renders.
      raf.current = requestAnimationFrame(() => commit(target));
      return () => cancelAnimationFrame(raf.current);
    }

    const DURATION = 420;
    let startTime = 0;

    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const t = Math.min(1, (now - startTime) / DURATION);
      const eased = 1 - (1 - t) ** 3;
      commit(from + delta * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);

  return value;
}

export function Earnings({
  avgStroopsBySource,
}: {
  avgStroopsBySource: Record<string, number>;
}) {
  const [selected, setSelected] = useState<string[]>(DEFAULT_ON);
  const [datasetsEach, setDatasetsEach] = useState(1);
  const [payout, setPayout] = useState("xlm");

  /** True once anything at all has been licensed. Until then there is no
   *  average to quote and the panel says that instead of showing a zero. */
  const priced = Object.keys(avgStroopsBySource).length > 0;

  const total = useMemo(
    () =>
      SOURCES.filter((s) => selected.includes(s.id)).reduce(
        (sum, s) => sum + (avgStroopsBySource[s.id] ?? 0),
        0,
      ) * datasetsEach,
    [selected, datasetsEach, avgStroopsBySource],
  );

  const shown = useTween(total / STROOPS_PER_XLM);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  /** A source's average, or a dash when nothing in that category has sold. */
  const rateLabel = (id: string) =>
    avgStroopsBySource[id] ? `${formatXlm(avgStroopsBySource[id])} XLM` : "—";

  return (
    <section
      id="earnings"
      className="relative border-y border-rule bg-paper-raised"
    >
      <div className="relative mx-auto max-w-6xl px-6 py-28 sm:py-36">
        <SectionHeading
          eyebrow="Earnings"
          title="See what you're currently giving away for free."
          body={
            priced
              ? "Pick the sources you'd be willing to share. Rates are what datasets in each category have actually settled for on testnet. They are an average of real sales, not a promise."
              : "Pick the sources you'd be willing to share. Nothing has been licensed on testnet yet, so there are no averages to quote. These fill in from real sales as the protocol runs."
          }
          align="center"
        />

        <Reveal delay={140}>
          <div className="mt-16 grid overflow-hidden rounded-2xl border border-rule bg-paper lg:grid-cols-[1.25fr_1fr]">
            {/* Left: the inputs */}
            <div className="border-rule p-7 sm:p-9 lg:border-r">
              <p className="eyebrow text-ink-faint">Your sources</p>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {SOURCES.map((source) => {
                  const active = selected.includes(source.id);
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => toggle(source.id)}
                      aria-pressed={active}
                      className={`group flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-200 ${
                        active
                          ? "border-slate/35 bg-slate/8 text-ink"
                          : "border-rule bg-paper-raised text-ink-faint hover:border-rule-strong hover:text-ink-dim"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-sm transition-colors ${
                          active
                            ? "bg-slate"
                            : "bg-ink-faint/40 group-hover:bg-ink-faint"
                        }`}
                      />
                      <span className="flex-1 truncate">{source.label}</span>
                      <span className="font-mono text-[0.6875rem] text-ink-faint tabular-nums">
                        {rateLabel(source.id)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-9">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="volume" className="eyebrow text-ink-faint">
                    Datasets per source
                  </label>
                  <span className="font-mono text-xs text-ink-dim">
                    {datasetsEach}×
                  </span>
                </div>
                <input
                  id="volume"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={datasetsEach}
                  onChange={(e) => setDatasetsEach(Number(e.target.value))}
                  className="mt-4 h-1 w-full cursor-pointer appearance-none rounded-full bg-paper-sunken accent-slate"
                />
              </div>

              <div className="mt-9">
                <p className="eyebrow text-ink-faint">Paid out as</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {PAYOUTS.map((method) => {
                    const active = payout === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        disabled={!method.ready}
                        onClick={() => setPayout(method.id)}
                        aria-pressed={active}
                        className={`rounded-lg border p-3 text-left transition-colors duration-200 ${
                          !method.ready
                            ? "cursor-not-allowed border-rule bg-paper-raised opacity-55"
                            : active
                              ? "border-slate/35 bg-slate/8"
                              : "border-rule bg-paper-raised hover:border-rule-strong"
                        }`}
                      >
                        <span
                          className={`block text-sm ${active ? "text-ink" : "text-ink-dim"}`}
                        >
                          {method.label}
                        </span>
                        <span className="mt-1 block font-mono text-[0.625rem] text-ink-faint">
                          {method.note}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: the number */}
            <div className="relative flex flex-col justify-between gap-8 bg-paper-raised p-7 sm:p-9">
              <div className="relative">
                <p className="eyebrow text-ink-faint">Estimated payout</p>
                {priced ? (
                  <>
                    <p className="display mt-4 text-5xl font-medium text-ink tabular-nums sm:text-6xl">
                      {shown.toFixed(2)}
                      <span className="ml-2 align-middle text-base font-normal text-ink-faint">
                        XLM
                      </span>
                    </p>
                    <p className="mt-4 font-mono text-xs text-ink-faint">
                      {selected.length} source
                      {selected.length === 1 ? "" : "s"} · {datasetsEach}{" "}
                      dataset{datasetsEach === 1 ? "" : "s"} each
                    </p>
                  </>
                ) : (
                  <>
                    <p className="display mt-4 text-5xl font-medium text-ink-faint tabular-nums sm:text-6xl">
                      —
                    </p>
                    <p className="mt-4 font-mono text-xs text-ink-faint">
                      no settled sales to average yet
                    </p>
                  </>
                )}

                {/* Itemised breakdown — shows the number is built, not invented. */}
                <ul className="mt-8 space-y-px border-t border-rule">
                  {SOURCES.filter((s) => selected.includes(s.id)).map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 border-b border-rule py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="h-1 w-1 shrink-0 rounded-sm bg-slate" />
                        <span className="truncate text-xs text-ink-dim">
                          {s.label}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-ink-faint tabular-nums">
                        {avgStroopsBySource[s.id]
                          ? `${formatXlm(avgStroopsBySource[s.id] * datasetsEach)} XLM`
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative space-y-4">
                <p className="text-sm text-pretty text-ink-dim">
                  {selected.length === 0
                    ? "Share nothing and you earn nothing. That's exactly what you're doing today, just without the payout."
                    : "Rare data earns more than common data. A dashcam clip from a rainy roundabout is worth more to a robotics team than another hour of scrolling."}
                </p>
                <Link
                  href="/dashboard"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-slate-deep px-5 py-3 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate"
                >
                  Claim your payout
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
