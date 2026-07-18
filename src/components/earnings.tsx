"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

/** Median monthly payout per source, in USD. Placeholder economics. */
const SOURCES = [
  { id: "browsing", label: "Browsing & search", rate: 9.4, on: true },
  { id: "purchases", label: "Purchase history", rate: 6.2, on: true },
  { id: "health", label: "Health & wearables", rate: 12.8, on: false },
  { id: "location", label: "Location trails", rate: 7.5, on: false },
  { id: "media", label: "Streaming & media", rate: 4.1, on: true },
  { id: "voice", label: "Voice samples", rate: 8.9, on: false },
  { id: "messaging", label: "Messaging metadata", rate: 5.3, on: false },
  { id: "dashcam", label: "Dashcam & camera", rate: 11.2, on: false },
];

const PAYOUTS = [
  { id: "bank", label: "Bank transfer", note: "2–3 business days · free" },
  { id: "paypal", label: "PayPal", note: "Instant · 1.5% fee" },
  { id: "usdc", label: "USDC", note: "Instant · network fee" },
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

export function Earnings() {
  const [selected, setSelected] = useState<string[]>(
    SOURCES.filter((s) => s.on).map((s) => s.id),
  );
  const [volume, setVolume] = useState(100);
  const [payout, setPayout] = useState("bank");

  const monthly = useMemo(() => {
    const base = SOURCES.filter((s) => selected.includes(s.id)).reduce(
      (sum, s) => sum + s.rate,
      0,
    );
    return base * (volume / 100);
  }, [selected, volume]);

  const shown = useTween(monthly);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  return (
    <section
      id="earnings"
      className="relative border-y border-rule bg-paper-raised"
    >
      <div className="relative mx-auto max-w-6xl px-6 py-28 sm:py-36">
        <SectionHeading
          eyebrow="Earnings"
          title="See what you're currently giving away for free."
          body="Pick the sources you'd be willing to share. These are median payouts from the last 90 days. An estimate, not a promise."
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
                        ${source.rate.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-9">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="volume" className="eyebrow text-ink-faint">
                    How much you&apos;re online
                  </label>
                  <span className="font-mono text-xs text-ink-dim">
                    {volume < 80
                      ? "Light"
                      : volume > 130
                        ? "Heavy"
                        : "Average"}
                  </span>
                </div>
                <input
                  id="volume"
                  type="range"
                  min={50}
                  max={160}
                  step={5}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="mt-4 h-1 w-full cursor-pointer appearance-none rounded-full bg-paper-sunken accent-slate"
                />
              </div>

              <div className="mt-9">
                <p className="eyebrow text-ink-faint">Paid out as</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {PAYOUTS.map((method) => {
                    const active = payout === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setPayout(method.id)}
                        aria-pressed={active}
                        className={`rounded-lg border p-3 text-left transition-colors duration-200 ${
                          active
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
                <p className="display mt-4 text-5xl font-medium text-ink tabular-nums sm:text-6xl">
                  <span className="text-ink-faint">$</span>
                  {shown.toFixed(2)}
                  <span className="ml-2 align-middle text-base font-normal text-ink-faint">
                    /mo
                  </span>
                </p>
                <p className="mt-4 font-mono text-xs text-ink-faint">
                  ≈ ${(monthly * 12).toFixed(0)} a year · {selected.length}{" "}
                  source{selected.length === 1 ? "" : "s"}
                </p>

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
                        ${((s.rate * volume) / 100).toFixed(2)}
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
                <a
                  href="#top"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-slate-deep px-5 py-3 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate"
                >
                  Claim your payout
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
