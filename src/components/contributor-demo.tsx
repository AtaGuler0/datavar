"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PixelMark } from "./logo";
import { Arrow } from "./night";

/**
 * The contributor dashboard, playable on the landing page. Same rail, same
 * three pages, same four stages a dataset moves through — but every action is
 * local state: nothing is uploaded, nothing is signed, nobody is paid. The
 * frame says so in its footer, and the buyer who shows up is named as the
 * simulation it is.
 *
 * The point is to let someone feel the loop before connecting a wallet: add a
 * file, watch it hash, grant consent, see it sell, claim it, or take it back.
 *
 * It also plays itself, like a video, once it is on screen: it marks the
 * control it is about to press, then presses it, and goes round the loop. Any
 * click inside the frame hands it over to the reader from exactly where it
 * stopped; Play hands it back. It stops off screen and in a hidden tab, and
 * never starts on its own for someone who asked for reduced motion.
 */

type Stage = "hashed" | "listed" | "licensed" | "paid" | "withdrawn";
type Page = "overview" | "data" | "earnings";

type Dataset = {
  id: number;
  title: string;
  source: string;
  hash: string;
  stage: Stage;
  price: number;
  receipt?: number;
  purpose?: string;
  months?: number;
};

const SOURCES = [
  { id: "dashcam", label: "Dashcam", title: "Evening drive, wet roads", price: 1.33 },
  { id: "voice", label: "Voice", title: "Voice memos, October", price: 1.45 },
  { id: "health", label: "Health", title: "Sleep and heart rate export", price: 1.15 },
  { id: "browsing", label: "Browsing", title: "Search history, last quarter", price: 1.29 },
];

const START: Dataset[] = [
  { id: 1, title: "Morning commute, rainy roundabout", source: "Dashcam", hash: "9c1e…a4f2", stage: "paid", price: 1.33, receipt: 284, purpose: "Commercial licensing", months: 12 },
  { id: 2, title: "Two years of grocery receipts", source: "Purchases", hash: "3f0b…7d1c", stage: "licensed", price: 1.51, receipt: 295, purpose: "Commercial licensing", months: 12 },
  { id: 3, title: "Running watch export", source: "Health", hash: "b82a…19e6", stage: "hashed", price: 1.15 },
];

const STAGE_ORDER: Stage[] = ["hashed", "listed", "licensed", "paid"];

const STAGE_LABEL: Record<Stage, string> = {
  hashed: "Needs consent",
  listed: "Listed",
  licensed: "Sold · claimable",
  paid: "Paid",
  withdrawn: "Withdrawn",
};

function hex(n: number) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const short = (h: string) => `${h.slice(0, 4)}…${h.slice(-4)}`;

export function ContributorDemo() {
  const [page, setPage] = useState<Page>("data");
  const [datasets, setDatasets] = useState<Dataset[]>(START);
  const [paidTotal, setPaidTotal] = useState(1.33);
  const [adding, setAdding] = useState(false);
  const [granting, setGranting] = useState<Dataset | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("Commercial licensing");
  const [months, setMonths] = useState(12);
  const [signing, setSigning] = useState(false);
  const [playing, setPlaying] = useState(false);
  /** The control the tour is about to press, ringed so it can be seen first. */
  const [target, setTarget] = useState<string | null>(null);
  const [, setTick] = useState(0);
  /** The reader paused it: scrolling back into view must not restart it. */
  const manual = useRef(false);
  const inView = useRef(false);
  const [sourceTurn, setSourceTurn] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const nextId = useRef(4);
  const nextReceipt = useRef(312);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const say = (message: string) => {
    setToast(message);
    later(3200, () => setToast((t) => (t === message ? null : t)));
  };

  const claimable = useMemo(
    () => datasets.filter((d) => d.stage === "licensed").reduce((s, d) => s + d.price, 0),
    [datasets],
  );

  const counts = {
    total: datasets.filter((d) => d.stage !== "withdrawn").length,
    awaiting: datasets.filter((d) => d.stage === "hashed").length,
    licensed: datasets.filter((d) => d.stage === "licensed" || d.stage === "paid").length,
  };

  /** What the reader could do next, for the hint on the overview. */
  const next =
    counts.awaiting > 0
      ? { label: "Grant consent on a dataset", page: "data" as Page }
      : claimable > 0
        ? { label: `Claim ${claimable.toFixed(2)} USDC`, page: "earnings" as Page }
        : { label: "Add another dataset", page: "data" as Page };

  const add = (source: (typeof SOURCES)[number]) => {
    const id = nextId.current++;
    const hash = hex(32);
    setDatasets((ds) => [
      { id, title: source.title, source: source.label, hash: short(hash), stage: "hashed", price: source.price },
      ...ds,
    ]);
    setAdding(false);
    say(`Hashed in your browser · ${short(hash)} · nothing uploaded`);
  };

  const grant = (d: Dataset, purpose: string, months: number) => {
    const receipt = nextReceipt.current++;
    setDatasets((ds) =>
      ds.map((x) => (x.id === d.id ? { ...x, stage: "listed", receipt, purpose, months } : x)),
    );
    setGranting(null);
    say(`Consent signed · receipt #${receipt} · listed in the marketplace`);
    // The simulated buyer. It only buys what is still listed by then.
    later(3000, () => {
      let sold = false;
      setDatasets((ds) =>
        ds.map((x) => {
          if (x.id === d.id && x.stage === "listed") {
            sold = true;
            return { ...x, stage: "licensed" };
          }
          return x;
        }),
      );
      later(0, () => sold && say(`A simulated buyer licensed it · +${d.price.toFixed(2)} USDC to claim`));
    });
  };

  const withdraw = (d: Dataset) => {
    setDatasets((ds) => ds.map((x) => (x.id === d.id ? { ...x, stage: "withdrawn" } : x)));
    say(`Receipt #${d.receipt} withdrawn · the next delivery is refused`);
  };

  const openGrant = (d: Dataset) => {
    setPurpose("Commercial licensing");
    setMonths(12);
    setSigning(false);
    setGranting(d);
  };

  const sign = () => {
    const d = granting;
    if (!d) return;
    setSigning(true);
    later(900, () => {
      grant(d, purpose, months);
      setSigning(false);
    });
  };

  const claim = () => {
    const amount = claimable;
    setDatasets((ds) => ds.map((x) => (x.stage === "licensed" ? { ...x, stage: "paid" } : x)));
    setPaidTotal((p) => p + amount);
    const tx = hex(32);
    setLastTx(short(tx));
    say(`Claimed ${amount.toFixed(2)} USDC · tx ${short(tx)}`);
  };

  const reset = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setDatasets(START);
    setPaidTotal(1.33);
    setLastTx(null);
    setToast(null);
    setAdding(false);
    setGranting(null);
    setSigning(false);
    setTarget(null);
    setPage("data");
  };

  /* ------------------------------------------------------------ the tour */

  /** The next control the tour would press, read off the state as it stands —
   *  so it picks up wherever the reader left it. No target means: wait. Pure,
   *  so it can run during render for the status line. */
  const describe = (): { target: string | null; doing: string } => {
    if (granting) {
      if (signing) return { target: null, doing: "waiting for the wallet" };
      if (months !== 6) return { target: "months-6", doing: "choosing an end date" };
      return { target: "sign", doing: "signing consent" };
    }
    if (adding) {
      const source = SOURCES[sourceTurn % SOURCES.length];
      return { target: `source-${source.id}`, doing: "adding a dataset" };
    }
    if (page === "earnings") {
      if (claimable > 0) return { target: "claim", doing: "claiming the payout" };
      return { target: "nav-data", doing: "back to your data" };
    }
    if (page === "overview") return { target: "nav-data", doing: "opening your data" };
    const hashed = datasets.find((d) => d.stage === "hashed");
    if (hashed) return { target: `grant-${hashed.id}`, doing: "granting consent" };
    if (datasets.some((d) => d.stage === "listed")) return { target: null, doing: "waiting for a buyer" };
    if (claimable > 0) return { target: "nav-earnings", doing: "going to earnings" };
    if (datasets.length >= 6) return { target: "reset", doing: "starting over" };
    return { target: "add", doing: "adding a dataset" };
  };

  /** Press the control a target names. Only ever called from a timer. */
  const perform = (id: string) => {
    if (id === "months-6") return setMonths(6);
    if (id === "sign") return sign();
    if (id === "claim") return claim();
    if (id === "reset") return reset();
    if (id === "add") return setAdding(true);
    if (id === "nav-data") return setPage("data");
    if (id === "nav-earnings") return setPage("earnings");
    if (id.startsWith("source-")) {
      const source = SOURCES.find((x) => `source-${x.id}` === id);
      setSourceTurn((t) => t + 1);
      if (source) add(source);
      return;
    }
    if (id.startsWith("grant-")) {
      const d = datasets.find((x) => `grant-${x.id}` === id);
      if (d) openGrant(d);
    }
  };

  const step = describe();

  // One beat per render while playing: ring the next control, then press it.
  useEffect(() => {
    if (!playing) return;
    const next = describe().target;
    const timer = !next
      ? window.setTimeout(() => setTick((t) => t + 1), 700)
      : target !== next
        ? window.setTimeout(() => setTarget(next), 900)
        : window.setTimeout(() => {
            setTarget(null);
            perform(next);
          }, 750);
    return () => window.clearTimeout(timer);
  });

  const play = () => {
    manual.current = false;
    setPlaying(true);
  };
  const pause = () => {
    manual.current = true;
    setPlaying(false);
    setTarget(null);
  };

  // Plays while on screen and the tab is visible, unless the reader paused it.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resume = () => {
      if (inView.current && !manual.current && !reduced && !document.hidden) setPlaying(true);
    };
    const seen = new IntersectionObserver(
      ([entry]) => {
        inView.current = entry.isIntersecting;
        if (entry.isIntersecting) resume();
        else setPlaying(false);
      },
      { threshold: 0.45 },
    );
    seen.observe(el);
    const onVisibility = () => (document.hidden ? setPlaying(false) : resume());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      seen.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /** The ring on whatever the tour is about to press. */
  const ring = (id: string) =>
    target === id ? " ring-2 ring-star ring-offset-2 ring-offset-night-900" : "";

  const NAV: { id: Page; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "data", label: "Your data" },
    { id: "earnings", label: "Earnings" },
  ];
  const current = NAV.find((n) => n.id === page)!.label;

  return (
    <div ref={root} className="relative">
      <div
        className="overflow-hidden rounded-2xl border border-line bg-night p-1.5 sm:p-2"
        // Any real press inside the frame means the reader is driving now.
        onPointerDownCapture={(e) => {
          if (playing && e.isTrusted) pause();
        }}
        onKeyDownCapture={(e) => {
          if (playing && e.isTrusted) pause();
        }}
      >
        <div className="flex h-[36rem]">
          {/* Rail */}
          <div className="hidden w-48 shrink-0 flex-col px-2 pt-2 md:flex">
            <div className="flex items-center gap-2.5 px-2 py-1">
              <PixelMark className="h-5 w-5" />
              <span className="leading-tight">
                <span className="block text-[0.8125rem] font-medium text-star">Datavar</span>
                <span className="block text-[0.6875rem] text-star-faint">Contributor</span>
              </span>
            </div>
            <p className="mt-5 px-2.5 text-xs text-star-faint">Your account</p>
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setPage(n.id)}
                className={`mt-1 rounded-md px-2.5 py-1.5 text-left text-[0.8125rem] transition-colors ${
                  page === n.id ? "bg-night-700 text-star" : "text-star-dim hover:bg-night-800 hover:text-star"
                }${ring(`nav-${n.id}`)}`}
              >
                {n.label}
              </button>
            ))}
            <span className="mt-auto mb-2 rounded-lg border border-line bg-night-850 px-2.5 py-2 font-mono text-[0.6875rem] text-star-dim">
              GDX4…Q7KP
            </span>
          </div>

          {/* Panel */}
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-night-900">
            <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-4 text-[0.8125rem]">
              {/* Below sm the tabs beside this already name the page, and
                  need the room. */}
              <span className="hidden truncate sm:inline">
                <span className="text-star-faint">Contributor</span>
                <span className="mx-2 text-star-ghost">/</span>
                <span className="text-star">{current}</span>
              </span>
              {/* Pages as tabs where there is no rail. */}
              <span className="flex gap-1 md:hidden">
                {NAV.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setPage(n.id)}
                    className={`rounded px-2.5 py-1.5 text-[0.6875rem] sm:px-2 sm:py-0.5 ${page === n.id ? "bg-night-700 text-star" : "text-star-faint"}${ring(`nav-${n.id}`)}`}
                  >
                    {n.label}
                  </button>
                ))}
              </span>
              <span className="hidden font-mono text-[0.625rem] tracking-[0.08em] text-star-faint uppercase md:inline">
                Stellar testnet
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {page === "overview" && (
                <div>
                  <p className="text-lg font-medium tracking-[-0.02em] text-star">Welcome back.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {[
                      ["Datasets", String(counts.total)],
                      ["Awaiting consent", String(counts.awaiting)],
                      ["Licensed", String(counts.licensed)],
                      ["Ready to claim", `${claimable.toFixed(2)} USDC`],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg border border-line bg-night-850 px-3 py-2.5">
                        <p className="text-[0.6875rem] text-star-faint">{k}</p>
                        <p className="mt-1 text-lg font-medium tracking-[-0.03em] text-star tabular-nums">{v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-lg border border-line p-4">
                    <p className="font-mono text-[0.625rem] tracking-[0.08em] text-star-faint uppercase">Next step</p>
                    <button
                      type="button"
                      onClick={() => setPage(next.page)}
                      className="group mt-2 inline-flex items-center gap-2 text-sm text-star"
                    >
                      {next.label}
                      <Arrow className="h-3 w-3 text-star-dim transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </button>
                    <ol className="mt-4 grid grid-cols-4 gap-2">
                      {["Hashed", "Consented", "Licensed", "Paid"].map((s, i) => (
                        <li key={s}>
                          <span className="block h-1 rounded-full bg-star-dim" style={{ opacity: 1 - i * 0.2 }} />
                          <span className="mt-1.5 block text-[0.6875rem] text-star-faint">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {page === "data" && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[0.8125rem] text-star-dim">
                      Each dataset, how far it has got, and what it needs next.
                    </p>
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className={`shrink-0 rounded-[10px] bg-star px-3 py-2 text-xs font-medium text-night transition-colors hover:bg-white sm:py-1.5${ring("add")}`}
                    >
                      Add dataset
                    </button>
                  </div>

                  <ul className="mt-4 overflow-hidden rounded-lg border border-line">
                    {datasets.map((d) => {
                      const reached = d.stage === "withdrawn" ? 0 : STAGE_ORDER.indexOf(d.stage) + 1;
                      return (
                        <li
                          key={d.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3.5 py-3 last:border-b-0 sm:flex-nowrap"
                        >
                          <span
                            className={`h-3 w-3 shrink-0 rounded-full border ${
                              d.stage === "withdrawn"
                                ? "border-danger"
                                : d.stage === "hashed"
                                  ? "border-star-faint"
                                  : "border-signal bg-signal/20"
                            }`}
                          />
                          {/* Below sm the title takes the whole first line and
                              the stage and action share the second, under it:
                              squeezed beside them it truncated to two words. */}
                          <span className="min-w-0 flex-1 basis-[calc(100%-1.5rem)] sm:basis-auto">
                            <span className="block truncate text-[0.8125rem] text-star">{d.title}</span>
                            <span className="mt-0.5 block font-mono text-[0.625rem] text-star-faint">
                              {d.source} · sha256 {d.hash}
                              {d.receipt ? ` · receipt #${d.receipt}` : ""}
                            </span>
                          </span>
                          <span className="hidden items-center gap-1 sm:flex" aria-hidden="true">
                            {[1, 2, 3, 4].map((i) => (
                              <span key={i} className={`h-1 w-3.5 rounded-full ${i <= reached ? "bg-star-dim" : "bg-night-700"}`} />
                            ))}
                          </span>
                          <span className="ml-6 shrink-0 text-[0.6875rem] text-star-faint sm:ml-0 sm:w-28 sm:text-right">
                            {STAGE_LABEL[d.stage]}
                          </span>
                          <span className="ml-auto shrink-0 text-right sm:ml-0 sm:w-24">
                            {d.stage === "hashed" && (
                              <button
                                type="button"
                                onClick={() => openGrant(d)}
                                className={`rounded-md bg-star px-2.5 py-1.5 text-[0.6875rem] font-medium text-night hover:bg-white sm:py-1${ring(`grant-${d.id}`)}`}
                              >
                                Grant consent
                              </button>
                            )}
                            {d.stage === "listed" && (
                              <button
                                type="button"
                                onClick={() => withdraw(d)}
                                className="rounded-md border border-line-strong px-2.5 py-1.5 text-[0.6875rem] text-star-dim hover:text-star sm:py-1"
                              >
                                Withdraw
                              </button>
                            )}
                            {(d.stage === "licensed" || d.stage === "paid") && (
                              <span className="text-xs text-star tabular-nums">{d.price.toFixed(2)} USDC</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {page === "earnings" && (
                <div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-line bg-night-850 p-4">
                      <p className="text-[0.6875rem] text-star-faint">Ready to claim</p>
                      <p className="mt-1 text-3xl font-medium tracking-[-0.04em] text-star tabular-nums">
                        {claimable.toFixed(2)} <span className="text-sm text-star-faint">USDC</span>
                      </p>
                      <button
                        type="button"
                        disabled={claimable === 0}
                        onClick={claim}
                        className={`mt-4 rounded-[10px] bg-star px-3.5 py-2 text-xs font-medium text-night transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-30${ring("claim")}`}
                      >
                        {claimable === 0 ? "Nothing to claim" : "Claim with your wallet"}
                      </button>
                    </div>
                    <div className="rounded-lg border border-line bg-night-850 p-4">
                      <p className="text-[0.6875rem] text-star-faint">Paid out to date</p>
                      <p className="mt-1 text-3xl font-medium tracking-[-0.04em] text-star tabular-nums">
                        {paidTotal.toFixed(2)} <span className="text-sm text-star-faint">USDC</span>
                      </p>
                      <p className="mt-4 font-mono text-[0.6875rem] text-star-faint">
                        {lastTx ? `last claim · tx ${lastTx}` : "every claim resolves on an explorer"}
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 overflow-hidden rounded-lg border border-line">
                    {datasets
                      .filter((d) => d.stage === "licensed" || d.stage === "paid")
                      .map((d) => (
                        <li key={d.id} className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2.5 text-[0.8125rem] last:border-b-0">
                          <span className="min-w-0 flex-1 truncate text-star-dim">{d.title}</span>
                          <span className="w-20 shrink-0 text-right text-xs text-star-faint">{d.stage === "paid" ? "Paid" : "Claimable"}</span>
                          <span className="w-20 shrink-0 text-right text-star tabular-nums">{d.price.toFixed(2)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Add a dataset */}
            {adding && (
              <Sheet title="Add a dataset" onClose={() => setAdding(false)}>
                <p className="text-xs text-star-faint">Pick what to contribute. It is hashed here before anything moves.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {SOURCES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => add(s)}
                      className={`rounded-lg border border-line px-3 py-3 text-left transition-colors hover:border-line-strong hover:bg-night-800${ring(`source-${s.id}`)}`}
                    >
                      <span className="block text-[0.8125rem] text-star">{s.label}</span>
                      <span className="mt-0.5 block truncate text-[0.6875rem] text-star-faint">{s.title}</span>
                    </button>
                  ))}
                </div>
              </Sheet>
            )}

            {/* Grant consent */}
            {granting && (
              <GrantSheet
                dataset={granting}
                purpose={purpose}
                months={months}
                signing={signing}
                onPurpose={setPurpose}
                onMonths={setMonths}
                onSign={sign}
                onClose={() => setGranting(null)}
                ring={ring}
              />
            )}

            {/* Toast */}
            <div
              aria-live="polite"
              className={`pointer-events-none absolute inset-x-4 bottom-4 flex justify-center transition-[opacity,transform] duration-300 ${
                toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              {toast && (
                <span className="rounded-full border border-line-strong bg-night-850 px-4 py-2 text-xs text-star shadow-xl shadow-black/50">
                  {toast}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 font-mono text-[0.6875rem] text-star-ghost">
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={playing ? pause : play}
            aria-label={playing ? "Pause the demo" : "Play the demo"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-star transition-colors hover:border-star sm:h-7 sm:w-7"
          >
            {playing ? (
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
                <rect x="2" y="1.5" width="2.6" height="9" rx="0.6" />
                <rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" className="ml-0.5 h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
                <path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1L3.9 1.1a.6.6 0 0 0-.9.5z" />
              </svg>
            )}
          </button>
          <span aria-live="polite" className={playing ? "text-star-dim" : ""}>
            {playing ? `Playing · ${step.doing}` : "Paused · your turn, or press play"}
          </span>
        </span>
        <span className="flex items-center gap-4">
          <button
            type="button"
            onClick={(e) => {
              if (e.isTrusted && playing) pause();
              reset();
            }}
            className={`rounded py-2 transition-colors hover:text-star sm:py-0${ring("reset")}`}
          >
            Reset
          </button>
          <Link href="/dashboard" className="group inline-flex items-center gap-1.5 py-2 text-star-dim transition-colors hover:text-star sm:py-0">
            Open the real dashboard
            <Arrow className="h-3 w-3" />
          </Link>
        </span>
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-night/70 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-line-strong bg-night-850 p-4 shadow-2xl shadow-black/60"
      >
        <div className="flex items-center justify-between">
          <p className="text-[0.8125rem] font-medium text-star">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="text-star-faint hover:text-star">
            ✕
          </button>
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

function GrantSheet({
  dataset,
  purpose,
  months,
  signing,
  onPurpose,
  onMonths,
  onSign,
  onClose,
  ring,
}: {
  dataset: Dataset;
  purpose: string;
  months: number;
  signing: boolean;
  onPurpose: (p: string) => void;
  onMonths: (m: number) => void;
  onSign: () => void;
  onClose: () => void;
  ring: (id: string) => string;
}) {
  const chip = (on: boolean) =>
    `rounded-md border px-2.5 py-1.5 text-[0.6875rem] transition-colors ${
      on ? "border-star text-star" : "border-line text-star-faint hover:text-star-dim"
    }`;

  return (
    <Sheet title="Grant consent" onClose={onClose}>
      <p className="truncate text-xs text-star-dim">{dataset.title}</p>
      <dl className="mt-3 space-y-3 text-[0.6875rem]">
        <div>
          <dt className="text-star-faint">Buyer</dt>
          <dd className="mt-1 text-xs text-star">Datavar marketplace</dd>
        </div>
        <div>
          <dt className="text-star-faint">Purpose</dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">
            {["Commercial licensing", "Research only"].map((p) => (
              <button key={p} type="button" onClick={() => onPurpose(p)} className={chip(purpose === p)}>
                {p}
              </button>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-star-faint">Ends after · required</dt>
          <dd className="mt-1.5 flex gap-1.5">
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onMonths(m)}
                className={chip(months === m) + ring(`months-${m}`)}
              >
                {m} months
              </button>
            ))}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={onSign}
        disabled={signing}
        className={`mt-4 flex h-9 w-full items-center justify-center rounded-[10px] bg-star text-xs font-medium text-night transition-colors hover:bg-white disabled:opacity-70${ring("sign")}`}
      >
        {signing ? "Waiting for your wallet…" : "Sign with your wallet"}
      </button>
      <p className="mt-2 text-center text-[0.625rem] text-star-faint">
        Becomes a receipt on Stellar. Only you can withdraw it.
      </p>
    </Sheet>
  );
}
