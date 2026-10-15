import type { ReactNode } from "react";
import { PixelMark } from "./logo";

/**
 * The buyer side of the product as four product shots, drawn in markup like
 * the contributor one beside the steps. Same chrome as /market — the bar with
 * Catalogue, Your licences and Profile — and the same fields a listing really
 * shows. The rows are sample data; the frame they sit in says so.
 */

type Listing = {
  category: string;
  format: string;
  size: string;
  runsTo: string;
  left: string;
  licensed: string;
  price: string;
  receipt: string;
};

const LISTINGS: Listing[] = [
  { category: "Dashcam & camera", format: "Images", size: "2.9 MB", runsTo: "18 Mar 2027", left: "155d", licensed: "1×", price: "1.20", receipt: "#295" },
  { category: "Location trails", format: "Tabular", size: "640 KB", runsTo: "14 May 2027", left: "212d", licensed: "Not yet", price: "1.00", receipt: "#301" },
  { category: "Voice samples", format: "Audio", size: "18 MB", runsTo: "21 Jan 2027", left: "98d", licensed: "3×", price: "1.45", receipt: "#277" },
  { category: "Health & wearables", format: "Tabular", size: "1.2 MB", runsTo: "11 Aug 2027", left: "301d", licensed: "Not yet", price: "1.15", receipt: "#318" },
];

function Chrome({ tab, children }: { tab: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-night-900">
      <div className="flex h-11 shrink-0 items-center gap-5 border-b border-line px-4">
        <span className="flex items-center gap-2">
          <PixelMark className="h-4 w-4" />
          <span className="text-[0.8125rem] font-medium text-star">Datavar</span>
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          {["Catalogue", "Your licences", "Profile"].map((item) => (
            <span
              key={item}
              className={`rounded-md px-2.5 py-1 text-xs ${
                item === tab ? "bg-night-700 text-star" : "text-star-faint"
              }`}
            >
              {item}
            </span>
          ))}
        </span>
        <span className="ml-auto rounded-md border border-line px-2 py-1 font-mono text-[0.625rem] text-star-dim">
          GBK2…M4QA
        </span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function ListingCard({ l, added = false }: { l: Listing; added?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-night-850 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] font-medium text-star">{l.category}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[0.6875rem] text-star-faint">
            {l.format}
            <span className="rounded border border-line px-1 font-mono text-[0.5625rem]">unchecked</span>
          </p>
        </div>
        <p className="text-sm font-medium text-star tabular-nums">
          {l.price} <span className="font-mono text-[0.5625rem] text-star-faint">USDC</span>
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[0.6875rem]">
        <div>
          <dt className="text-star-faint">Size</dt>
          <dd className="text-star-dim">{l.size}</dd>
        </div>
        <div>
          <dt className="text-star-faint">Licensed</dt>
          <dd className="text-star-dim">{l.licensed}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-star-faint">Consent runs to</dt>
          <dd className="text-star-dim">
            {l.runsTo} · {l.left}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
        <span className="font-mono text-[0.5625rem] text-star-faint">receipt {l.receipt}</span>
        <span
          className={`rounded-md px-2.5 py-1 text-[0.6875rem] font-medium ${
            added ? "border border-line-strong text-star-dim" : "bg-star text-night"
          }`}
        >
          {added ? "In basket" : "Add"}
        </span>
      </div>
    </div>
  );
}

/** Your licences, with one opened and checked against the contract. */
export function VerifyScreen() {
  return (
    <Chrome tab="Your licences">
      <div className="grid h-full grid-cols-1 sm:grid-cols-[1.15fr_1fr]">
        <div className="border-line p-4 sm:border-r">
          <p className="text-[0.8125rem] font-medium text-star">Your licences</p>
          <p className="mt-0.5 text-[0.6875rem] text-star-faint">Each one stands on a receipt you can check</p>
          <ul className="mt-4 overflow-hidden rounded-lg border border-line">
            {LISTINGS.slice(0, 3).map((l, i) => (
              <li
                key={l.receipt}
                className={`flex items-center gap-3 border-b border-line px-3 py-2.5 text-xs last:border-b-0 ${
                  i === 0 ? "bg-night-800" : ""
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full border border-signal bg-signal/20" />
                <span className="flex-1 truncate text-star">{l.category}</span>
                <span className="font-mono text-[0.625rem] text-star-faint">{l.receipt}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* Under the list on a phone rather than gone: the contract
            answering is the point of the screen. */}
        <div className="border-t border-line p-4 sm:border-t-0">
          <p className="font-mono text-[0.625rem] tracking-[0.08em] text-star-faint uppercase">Receipt #295</p>
          <dl className="mt-3 space-y-2.5 text-xs">
            {[
              ["Buyer", "Datavar marketplace"],
              ["Purpose", "Commercial licensing"],
              ["Runs to", "18 Mar 2027"],
              ["Signed by", "GDX4…Q7KP"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line pb-2">
                <dt className="text-star-faint">{k}</dt>
                <dd className="text-star-dim">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 rounded-lg border border-line bg-night p-3 font-mono text-[0.6875rem] leading-relaxed">
            <p className="text-star-faint"># ask the contract, not us</p>
            <p className="text-star-dim">
              <span className="text-star">is_valid</span> --id 295
            </p>
            <p className="mt-1">
              <span className="text-star-ghost">→ </span>
              <span className="text-signal">true</span>
            </p>
          </div>
        </div>
      </div>
    </Chrome>
  );
}

/** The catalogue with filters applied. */
export function CatalogueScreen() {
  return (
    <Chrome tab="Catalogue">
      <div className="flex h-full">
        <div className="hidden w-40 shrink-0 border-r border-line p-4 sm:block">
          <p className="text-xs font-medium text-star">Filters</p>
          <p className="mt-4 font-mono text-[0.5625rem] tracking-[0.08em] text-star-faint uppercase">Source</p>
          {["Dashcam & camera", "Location trails", "Voice samples", "Health"].map((s, i) => (
            <p key={s} className="mt-2 flex items-center gap-2 text-[0.6875rem] text-star-dim">
              <span className={`h-2.5 w-2.5 rounded-sm border ${i < 3 ? "border-star bg-star" : "border-line-strong"}`} />
              {s}
            </p>
          ))}
          <p className="mt-5 font-mono text-[0.5625rem] tracking-[0.08em] text-star-faint uppercase">Consent left</p>
          <p className="mt-2 rounded-md border border-line-strong px-2 py-1 text-[0.6875rem] text-star">more than 90 days</p>
          <p className="mt-5 font-mono text-[0.5625rem] tracking-[0.08em] text-star-faint uppercase">Price in USDC</p>
          <p className="mt-2 rounded-md border border-line px-2 py-1 text-[0.6875rem] text-star-dim">up to 1.50</p>
        </div>
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-star-dim">
              <span className="text-star">38</span> datasets match
            </p>
            <span className="rounded-md border border-line px-2 py-1 text-[0.625rem] text-star-dim">Newest first</span>
          </div>
          {/* Two cards on a phone: stacked one per row, four would make
              this screen taller than the viewport. */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 max-sm:[&>*:nth-child(n+3)]:hidden">
            {LISTINGS.map((l) => (
              <ListingCard key={l.receipt} l={l} />
            ))}
          </div>
        </div>
      </div>
    </Chrome>
  );
}

/** The basket open over the catalogue, at the moment of signing. */
export function CheckoutScreen() {
  return (
    <Chrome tab="Catalogue">
      <div className="grid h-full gap-3 p-4 opacity-30 sm:grid-cols-2 max-sm:[&>*:nth-child(n+3)]:hidden" aria-hidden="true">
        {LISTINGS.map((l, i) => (
          <ListingCard key={l.receipt} l={l} added={i !== 1} />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-line-strong bg-night-850 p-4 shadow-2xl shadow-black/60">
          <p className="text-[0.8125rem] font-medium text-star">Review licence</p>
          <p className="mt-0.5 text-[0.6875rem] text-star-faint">Testnet USDC. Nothing here moves real money.</p>
          {[LISTINGS[0], LISTINGS[2], LISTINGS[3]].map((l) => (
            <div key={l.receipt} className="mt-3 flex justify-between text-xs">
              <span className="text-star-dim">{l.category}</span>
              <span className="text-star tabular-nums">{l.price} USDC</span>
            </div>
          ))}
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-xs text-star-dim">Total</span>
            <span className="text-xl font-medium tracking-[-0.04em] text-star tabular-nums">3.80 USDC</span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {["Function, signer and exact total checked", "3 of 3 receipts re-read on-chain"].map((c) => (
              <li key={c} className="flex items-center gap-2 text-[0.6875rem] text-star-dim">
                <span className="text-signal">✓</span>
                {c}
              </li>
            ))}
          </ul>
          <span className="mt-4 flex h-9 items-center justify-center rounded-[10px] bg-star text-xs font-medium text-night">
            Sign once in your wallet
          </span>
        </div>
      </div>
    </Chrome>
  );
}

/** A licence whose consent was withdrawn: the history, and the refusal. */
export function DeliveryScreen() {
  const events = [
    ["27 Aug", "Consent granted to the marketplace"],
    ["30 Aug", "Licensed · first download delivered"],
    ["5 Sep", "Contributor revoked on Stellar"],
  ];
  return (
    <Chrome tab="Your licences">
      <div className="h-full p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.8125rem] font-medium text-star">Voice samples · receipt #277</p>
            <p className="mt-0.5 text-[0.6875rem] text-star-faint">Audio · 18 MB · licensed 30 Aug 2026</p>
          </div>
          <span className="rounded-md border border-danger/50 px-2 py-1 font-mono text-[0.625rem] tracking-[0.06em] text-danger uppercase">
            Consent withdrawn
          </span>
        </div>
        <ol className="mt-6 ml-1 border-l border-line-strong">
          {events.map(([at, what]) => (
            <li key={at} className="relative pb-5 pl-5">
              <span className="absolute top-1 -left-[4.5px] h-2 w-2 rounded-full border border-star-faint bg-night-900" />
              <p className="font-mono text-[0.625rem] tracking-[0.06em] text-star-faint uppercase">{at}</p>
              <p className="mt-0.5 text-xs text-star">{what}</p>
            </li>
          ))}
          <li className="relative pl-5">
            <span className="absolute top-1 -left-[4.5px] h-2 w-2 rounded-full border border-danger bg-danger/30" />
            <p className="font-mono text-[0.625rem] tracking-[0.06em] text-star-faint uppercase">5 Sep · next ledger</p>
            <p className="mt-0.5 text-xs text-danger">Download refused. The receipt behind this licence no longer stands.</p>
          </li>
        </ol>
        <div className="mt-6 flex items-center gap-3">
          <span className="rounded-[10px] border border-line px-3 py-2 text-xs text-star-ghost line-through">Download</span>
          <span className="text-[0.6875rem] text-star-faint">Checked against the contract on every request</span>
        </div>
      </div>
    </Chrome>
  );
}
