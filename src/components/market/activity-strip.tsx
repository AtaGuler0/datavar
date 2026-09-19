"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBytes, formatCount } from "@/lib/format";
import { formatAmount, formatMoney } from "@/lib/stellar/config";
import { sourceLabel } from "@/lib/supabase/datasets";
import {
  listActivity,
  readPulse,
  type Activity,
  type Pulse,
} from "@/lib/supabase/market";

/**
 * What the marketplace is doing, above the catalogue.
 *
 * A catalogue with no visible trade is a shop with the lights off. A buyer
 * weighing a dataset cannot tell whether anyone has ever licensed one, and a
 * contributor deciding whether to list cannot tell whether listing leads
 * anywhere. This is the answer to both, and it is read from a public view —
 * anyone can see it, signed in or not.
 *
 * Nobody is named. Both sides of a licence are salted digests, so the feed can
 * say a buyer has licensed three times today without saying which wallet they
 * are or which company is behind them. The organisation on a licence is for
 * the contributor who sold to them, and stays there.
 *
 * It refreshes on a timer and whenever a purchase happens on this page, so
 * somebody who has just bought something sees their own licence appear in it.
 */

/** Often enough to feel alive, rarely enough to be two requests a minute. */
const REFRESH_MS = 30_000;

export function ActivityStrip({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [failed, setFailed] = useState(false);

  const read = useCallback(async () => {
    const [activity, totals] = await Promise.all([listActivity(8), readPulse()]);
    return { activity, totals };
  }, []);

  useEffect(() => {
    let live = true;

    const load = () => {
      read()
        .then(({ activity, totals }) => {
          if (!live) return;
          setRows(activity);
          setPulse(totals);
          setFailed(false);
        })
        .catch(() => live && setFailed(true));
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [read, refreshKey]);

  // Nothing licensed yet, or the view is not there: either way this is a strip
  // with nothing to say, and an empty box saying so would be worse than none.
  if (failed || (rows !== null && rows.length === 0)) return null;

  return (
    <section
      aria-label="Recent licences"
      className="mt-6 overflow-hidden rounded-2xl border border-rule bg-paper"
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-rule px-5 py-3.5">
        <h2 className="text-sm font-medium text-ink">Licensed lately</h2>
        {pulse && (
          <dl className="flex flex-wrap items-center gap-x-7 gap-y-2">
            <Figure label="Licences" value={formatCount(pulse.licences)} />
            <Figure
              label="Paid to contributors"
              value={formatMoney({
                XLM: Number(pulse.gross_stroops),
                USDC: Number(pulse.gross_usdc),
              })}
            />
            <Figure label="Buyers" value={formatCount(pulse.buyers)} />
            <Figure
              label="Last 24h"
              value={formatCount(pulse.last_day)}
              quiet={pulse.last_day === 0}
            />
          </dl>
        )}
      </div>

      {rows === null ? (
        <div className="flex gap-2 p-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 flex-1 animate-pulse rounded-xl bg-paper-sunken/60"
            />
          ))}
        </div>
      ) : (
        <ul className="flex snap-x gap-2 overflow-x-auto p-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="min-w-56 shrink-0 snap-start rounded-xl border border-rule bg-paper-raised/50 px-3.5 py-2.5"
            >
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-ink">
                  {sourceLabel(row.source_type)}
                </span>
                <span className="shrink-0 tabular-nums text-ink-dim">
                  {formatAmount(Number(row.price_stroops), row.asset)}{" "}
                  <span className="font-mono text-[0.625rem] text-ink-faint">
                    {row.asset}
                  </span>
                </span>
              </p>
              <p className="mt-1 truncate font-mono text-[0.625rem] text-ink-faint">
                {formatBytes(row.byte_size)}
                <span className="mx-1.5">·</span>
                {ago(row.created_at)}
                <span className="mx-1.5">·</span>
                <span title="An opaque, stable id for the buyer. It is a salted digest, not an address.">
                  buyer {row.buyer_id.slice(0, 6)}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  quiet,
}: {
  label: string;
  value: string;
  quiet?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[0.6875rem] text-ink-faint">{label}</dt>
      <dd
        className={`text-sm tabular-nums ${quiet ? "text-ink-faint" : "text-ink"}`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * "4m ago". Rendered from a timestamp the server sent, so it is allowed to be
 * approximate — what it must not do is claim a precision the feed does not
 * have, which is why nothing here says seconds.
 */
function ago(at: string): string {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(at).getTime()) / 60_000),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
