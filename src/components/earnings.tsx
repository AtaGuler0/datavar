"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { STROOPS_PER_XLM, USDC_PER_XLM_LIST } from "@/lib/stellar/config";
import { Reveal } from "./reveal";
import { EarningsChart } from "./earnings-chart";
import { NightHeading, Plate, PillLink } from "./night";

/**
 * What a contributor might earn. The rates are not ours to invent: each one is
 * the average price a dataset in that category has actually settled for on
 * testnet, passed in from the sales table. A category nobody has licensed yet
 * has no rate, and the estimator says so rather than filling the gap.
 */

/** Source categories, mirroring SOURCE_TYPES in lib/supabase/datasets. */
const SOURCES = [
  { id: "browsing", label: "Browsing & search", short: "Browsing" },
  { id: "purchases", label: "Purchase history", short: "Purchases" },
  { id: "health", label: "Health & wearables", short: "Health" },
  { id: "location", label: "Location trails", short: "Location" },
  { id: "media", label: "Streaming & media", short: "Media" },
  { id: "voice", label: "Voice samples", short: "Voice" },
  { id: "messaging", label: "Messaging metadata", short: "Messaging" },
  { id: "dashcam", label: "Dashcam & camera", short: "Dashcam" },
];

/** Which checkboxes start ticked. A UI default, not a claim about anything. */
const DEFAULT_ON = ["browsing", "purchases", "media"];

/**
 * XLM stroops → USDC. The averages come from XLM sales; the same datasets are
 * listed in USDC at a fixed rate, and that rate is what turns one into the
 * other here.
 */
function toUsdc(stroops: number) {
  return (stroops / STROOPS_PER_XLM) * USDC_PER_XLM_LIST;
}

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

  const shown = useTween(toUsdc(total));

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  /** The total and the line under it, set large in the right column and
   *  smaller under the slider on a phone. */
  const estimate = (big: boolean) => (
    <>
      <p className="font-mono text-[0.75rem] tracking-[0.08em] text-star-dim uppercase">
        Estimate · if each sells once
      </p>
      {priced ? (
        <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${big ? "mt-4" : "mt-3"}`}>
          <p
            className={`font-medium tracking-[-0.055em] text-star tabular-nums ${
              big ? "text-6xl sm:text-[5.5rem] sm:leading-none" : "text-5xl leading-none"
            }`}
          >
            {shown.toFixed(2)}
          </p>
          <span className="rounded-full border border-line-strong px-3 py-1 font-mono text-sm text-star-dim">
            USDC
          </span>
        </div>
      ) : (
        <p
          className={`font-medium tracking-[-0.055em] text-star-ghost ${
            big ? "mt-4 text-6xl sm:text-[5.5rem] sm:leading-none" : "mt-3 text-5xl leading-none"
          }`}
        >
          —
        </p>
      )}
      <p className={`font-mono text-xs text-star-faint ${big ? "mt-4" : "mt-3"}`}>
        {priced
          ? `${selected.length} source${selected.length === 1 ? "" : "s"} · ${datasetsEach} dataset${datasetsEach === 1 ? "" : "s"} each · from testnet sales`
          : "no settled sales to average yet"}
      </p>
    </>
  );

  /** A source's average, or a dash when nothing in that category has sold. */
  const rateLabel = (id: string) =>
    avgStroopsBySource[id] ? `${toUsdc(avgStroopsBySource[id]).toFixed(2)} USDC` : "—";

  return (
    <section id="earnings" className="bg-night">
      <div className="mx-auto max-w-6xl px-6 py-28 sm:py-36">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <NightHeading
            eyebrow="Earnings"
            title="Put a price on it."
            aside="See what you're giving away for free."
          />
          <Reveal delay={120}>
            <p className="max-w-md text-[0.9375rem] leading-relaxed text-pretty text-star-dim lg:justify-self-end">
              {priced
                ? "Pick the sources you'd be willing to share. Rates are testnet averages from a buyer we simulate, in USDC: read them as a comparison, not a promise."
                : "Pick the sources you'd be willing to share. Nothing has sold on testnet yet, so the rates fill in once something does."}
            </p>
          </Reveal>
        </div>

        <Reveal delay={140}>
          <Plate
            fig="Fig 0.2"
            tag="Estimate"
            className="mt-16"
            bodyClassName="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
          >
            {/* Left: the inputs */}
            <div className="border-line p-5 pt-7 sm:p-8 lg:border-r">
              <div className="flex items-center justify-between gap-4">
                <label
                  htmlFor="volume"
                  className="font-mono text-[0.75rem] tracking-[0.08em] text-star-dim uppercase"
                >
                  Datasets per source
                </label>
                <span className="min-w-12 rounded-lg border border-line-strong px-3 py-1.5 text-right font-mono text-lg text-star tabular-nums">
                  {datasetsEach}
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
                className="estimate-range mt-6 w-full cursor-pointer"
              />
              {/* One tick per value, so the slider reads as the ten choices it is. */}
              <div aria-hidden="true" className="mt-2 flex justify-between px-[7px]">
                {Array.from({ length: 10 }, (_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-px ${i < datasetsEach ? "bg-star-dim" : "bg-star-ghost"}`}
                  />
                ))}
              </div>
              <div aria-hidden="true" className="mt-2 flex justify-between font-mono text-[0.6875rem] text-star-faint">
                <span>1</span>
                <span>5</span>
                <span>10</span>
              </div>

              {/* On a phone the total answers the slider straight under it,
                  and the chart that explains it waits for a wider screen. */}
              <div className="mt-8 border-t border-line pt-6 sm:hidden">
                {estimate(false)}
              </div>

              <div className="mt-8 flex items-baseline justify-between sm:mt-10">
                <p className="font-mono text-[0.75rem] tracking-[0.08em] text-star-dim uppercase">
                  Sources
                </p>
                <p className="font-mono text-[0.75rem] text-star-faint">
                  {selected.length} of {SOURCES.length} on
                </p>
              </div>
              <ul className="mt-3 border-t border-line">
                {SOURCES.map((source) => {
                  const active = selected.includes(source.id);
                  return (
                    <li key={source.id} className="border-b border-line">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={active}
                        onClick={() => toggle(source.id)}
                        className="group flex w-full items-center gap-3.5 py-2 text-left sm:py-2.5"
                      >
                        <span
                          className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 ${
                            active ? "border-star bg-star" : "border-line-strong bg-night-800"
                          }`}
                        >
                          <span
                            className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-[left,background-color] duration-200 ${
                              active ? "left-[18px] bg-night" : "left-[2px] bg-star-faint"
                            }`}
                          />
                        </span>
                        <span
                          className={`flex-1 truncate text-sm transition-colors ${
                            active ? "text-star" : "text-star-faint group-hover:text-star-dim"
                          }`}
                        >
                          {source.label}
                        </span>
                        <span className="font-mono text-[0.6875rem] text-star-faint tabular-nums">
                          {rateLabel(source.id)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-6 font-mono text-[0.6875rem] text-star-faint">
                Paid out in <span className="text-star-dim">USDC</span>, claimed
                from the payout contract
              </p>
              <PillLink href="/dashboard" className="mt-5 sm:hidden">
                Claim your payout
              </PillLink>
            </div>

            {/* Right: the number, and how it's built */}
            <div className="hidden min-w-0 flex-col border-t border-line p-8 sm:flex lg:border-t-0">
              {estimate(true)}

              <div className="mt-8 flex-1">
                {priced && selected.length > 0 ? (
                  <EarningsChart
                    unit="USDC"
                    format={(n) => n.toFixed(2)}
                    parts={SOURCES.filter((s) => selected.includes(s.id)).map((s) => ({
                      id: s.id,
                      label: s.short,
                      value: toUsdc((avgStroopsBySource[s.id] ?? 0) * datasetsEach),
                    }))}
                  />
                ) : (
                  <p className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-line text-center text-sm text-pretty text-star-faint">
                    {selected.length === 0
                      ? "Share nothing and you earn nothing. That's exactly what you're doing today, just without the payout."
                      : "Nothing to build from until a category has sold."}
                  </p>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
                <p className="font-mono text-[0.6875rem] text-star-faint">
                  Hover a column · ruled in tenths of the total
                </p>
                <PillLink href="/dashboard">Claim your payout</PillLink>
              </div>
            </div>
          </Plate>
        </Reveal>
      </div>
    </section>
  );
}
