"use client";

import { useState } from "react";
import Link from "next/link";
import { authHeaders } from "@/lib/auth/session-store";
import { CLEANUP_SQL } from "@/lib/demo-data";
import { Card } from "@/components/dashboard/primitives";

/**
 * The demo-data control. It exists because an empty protocol cannot be judged:
 * every chart is a flat line and every table an empty state, so no screen shows
 * what it looks like doing its job.
 *
 * Everything it writes is invented and removable — seeded rows carry a `seed/`
 * storage path, and the SQL that deletes them is printed below rather than
 * hidden behind a button, because the tables have no delete policy and nothing
 * in this app can quietly remove a contribution.
 */

type Result = {
  contributors: number;
  datasets: number;
  sales: number;
  claimed: number;
};

export function SeedPanel() {
  const [contributors, setContributors] = useState(8);
  const [datasetsPer, setDatasetsPer] = useState(3);
  const [days, setDays] = useState(60);
  const [includeSelf, setIncludeSelf] = useState(true);
  const [wallet, setWallet] = useState("");

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const seed = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/dev/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          contributors,
          datasetsPer,
          days,
          includeSelf,
          wallet: wallet.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Seeding failed.");
      setResult(body as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seeding failed.");
    } finally {
      setRunning(false);
    }
  };

  const copyCleanup = async () => {
    try {
      await navigator.clipboard.writeText(CLEANUP_SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused — the SQL is on screen either way.
    }
  };

  return (
    <div className="mt-10 space-y-3">
      <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950">
        <div className="p-7 sm:p-9">
          <p className="eyebrow text-chalk-faint">Invented data</p>
          <p className="mt-3 text-lg text-balance text-chalk">
            Fill the protocol with plausible contributions.
          </p>
          <p className="mt-2 max-w-lg text-sm text-pretty text-chalk-dim">
            Contributors, datasets and sales, spread over recent weeks. None of
            it is real, and none of it moves money — seeded payouts are marked
            paid without a transaction, because no payment was made.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            {/* Zero is meaningful: fill one named wallet without inventing a
                crowd around it. */}
            <NumberField
              label="Other contributors"
              value={contributors}
              min={0}
              max={40}
              onChange={setContributors}
            />
            <NumberField
              label="Datasets each"
              value={datasetsPer}
              min={1}
              max={8}
              onChange={setDatasetsPer}
            />
            <NumberField
              label="Spread over days"
              value={days}
              min={1}
              max={365}
              onChange={setDays}
            />
          </div>

          <label className="mt-5 flex cursor-pointer items-center gap-2.5 text-sm text-chalk-dim">
            <input
              type="checkbox"
              checked={includeSelf}
              onChange={(e) => setIncludeSelf(e.target.checked)}
              className="h-4 w-4 accent-chalk"
            />
            Give a real wallet a share, so a dashboard fills up too
          </label>

          {includeSelf && (
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium text-chalk-dim">
                Which wallet{" "}
                <span className="font-normal text-chalk-faint">
                  blank means the one you are signed in as
                </span>
              </span>
              <input
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="G…"
                spellCheck={false}
                className="w-full rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 font-mono text-sm text-chalk outline-none transition-colors placeholder:text-chalk-faint focus:border-rule-dark-strong"
              />
            </label>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={seed}
              disabled={running}
              className="inline-flex items-center rounded-lg bg-chalk px-5 py-2.5 text-sm font-medium text-ink-950 transition-colors duration-200 hover:bg-paper disabled:opacity-70"
            >
              {running ? "Seeding…" : "Seed demo data"}
            </button>
            <p className="font-mono text-xs text-chalk-faint">
              {contributors * datasetsPer + (includeSelf ? datasetsPer : 0)}{" "}
              datasets
            </p>
          </div>

          {error && (
            <p className="mt-5 text-sm text-pretty text-chalk-dim">{error}</p>
          )}

          {result && (
            <div className="mt-5 border-t border-ink-800 pt-5">
              <p className="text-sm text-chalk">
                Wrote {result.datasets} datasets across {result.contributors}{" "}
                contributors, {result.sales} sales, {result.claimed} already
                paid.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center rounded-lg border border-ink-800 bg-ink-900 px-4 py-2 text-sm font-medium text-chalk-dim transition-colors hover:text-chalk"
                >
                  See your dashboard
                </Link>
                <Link
                  href="/protocol"
                  className="inline-flex items-center rounded-lg border border-ink-800 bg-ink-900 px-4 py-2 text-sm font-medium text-chalk-dim transition-colors hover:text-chalk"
                >
                  See the protocol page
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <Card
        title="What this can't do"
        subtitle="And why that's the right answer"
      >
        <p className="text-sm text-pretty text-ink-dim">
          It can&apos;t grant consent. A receipt is signed by the
          contributor&apos;s own wallet against the contract, and holding the
          server&apos;s secrets is no substitute for that signature — which is
          the whole property consent-on-a-ledger exists to have. Seeded datasets
          therefore sit at the consent step.
        </p>
        <p className="mt-3 text-sm text-pretty text-ink-dim">
          To see a consent receipt, grant one yourself on a seeded dataset from{" "}
          <Link
            href="/dashboard/data"
            className="text-ink underline decoration-rule-strong underline-offset-2 transition-colors hover:decoration-ink"
          >
            your data
          </Link>
          . That signs a real transaction on testnet, and the row moves along.
        </p>
      </Card>

      <Card
        title="Removing it"
        subtitle="Seeded rows live under a seed/ path"
        action={
          <button
            type="button"
            onClick={copyCleanup}
            className="shrink-0 text-xs font-medium text-ink-dim transition-colors hover:text-ink"
          >
            {copied ? "Copied" : "Copy SQL"}
          </button>
        }
      >
        <p className="text-sm text-pretty text-ink-dim">
          Neither table has a delete policy, so nothing in this app can remove a
          contribution — including this panel. Run this in the Supabase SQL
          editor when you&apos;re done looking.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-rule bg-paper-sunken p-4 font-mono text-xs leading-relaxed text-ink-dim">
          <code>{CLEANUP_SQL}</code>
        </pre>
      </Card>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-chalk-dim">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) {
            onChange(Math.max(min, Math.min(max, Math.floor(next))));
          }
        }}
        className="w-full rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 font-mono text-sm tabular-nums text-chalk outline-none transition-colors focus:border-rule-dark-strong"
      />
    </label>
  );
}
