"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { formatBytes } from "@/lib/format";
import { listDatasets, sourceLabel, type Dataset } from "@/lib/supabase/datasets";
import { Card } from "./primitives";
import { useWallet } from "./wallet-provider";

/**
 * Granting consent. The contributor picks one of their own datasets, names who
 * may use it and what for, and sets the date it ends — then signs. What their
 * wallet signs is the transaction the contract checks, so this form cannot
 * grant anything on their behalf; it can only ask.
 *
 * The dataset list is the local one because the hash is the join: the digest
 * computed in the browser at upload time is the same 32 bytes the receipt
 * commits to on-chain.
 */

const DEFAULT_TERM_DAYS = 90;
const MAX_PURPOSE_LEN = 200;

/** "2026-11-06" → the last second of that day, UTC, as a unix timestamp. */
function endOfDay(date: string): number {
  return Math.floor(Date.parse(`${date}T23:59:59Z`) / 1000);
}

function isoDateIn(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function ConsentGrantForm({
  onGranted,
  fixed,
  bare = false,
}: {
  onGranted: () => void;
  /** Grant for this dataset only — the picker disappears and the form is
   *  already about the row it was opened from. */
  fixed?: Dataset;
  /** Drop the Card chrome, for when this renders inside another surface. */
  bare?: boolean;
}) {
  const { address, signTransaction } = useWallet();
  // Ids have to be unique per instance: the data page can mount this inside a
  // row while the consent page has its own, and a duplicated htmlFor points a
  // label at the wrong field.
  const uid = useId();

  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [datasetId, setDatasetId] = useState("");
  const [buyer, setBuyer] = useState("");
  const [purpose, setPurpose] = useState("");
  // Computed once, on mount. Safe to read the clock here because WalletGate
  // only renders this form after a wallet connects, which never happens during
  // a server render — so there is no prerendered date to disagree with.
  const [expires, setExpires] = useState(() => isoDateIn(DEFAULT_TERM_DAYS));

  const [step, setStep] = useState<"idle" | "building" | "signing" | "sending">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Nothing to pick from when the caller already named the dataset.
    if (!address || fixed) return;
    let cancelled = false;
    listDatasets(address)
      .then((rows) => !cancelled && setDatasets(rows))
      .catch(() => !cancelled && setDatasets([]));
    return () => {
      cancelled = true;
    };
  }, [address, fixed]);

  const dataset = fixed ?? datasets?.find((d) => d.id === datasetId) ?? null;
  const busy = step !== "idle";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!address || !dataset || busy) return;

    setError(null);
    try {
      setStep("building");
      const prepared = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grant",
          contributor: address,
          buyer: buyer.trim(),
          datasetHash: dataset.sha256,
          purpose: purpose.trim(),
          expiresAt: endOfDay(expires),
        }),
      });
      const built = await prepared.json();
      if (!prepared.ok) throw new Error(built?.error ?? "Couldn't prepare the grant.");

      setStep("signing");
      const signed = await signTransaction(built.xdr);

      setStep("sending");
      const sent = await fetch("/api/consent/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xdr: signed }),
      });
      const result = await sent.json();
      if (!sent.ok) throw new Error(result?.error ?? "The grant didn't go through.");

      setBuyer("");
      setPurpose("");
      setDatasetId("");
      onGranted();
    } catch (e) {
      // A wallet rejection is a decision, not a failure — say so in those words.
      const message = e instanceof Error ? e.message : "";
      setError(
        /reject|denied|declin|cancel/i.test(message)
          ? "You declined the signature. Nothing was recorded."
          : message || "The grant didn't go through.",
      );
    } finally {
      setStep("idle");
    }
  };

  if (!fixed && datasets !== null && datasets.length === 0) {
    return (
      <Card title="Grant consent" subtitle="Nothing to grant consent for yet">
        <div className="flex flex-col items-center rounded-xl border border-dashed border-rule-strong bg-paper-raised/50 px-6 py-10 text-center">
          <p className="text-sm text-ink-dim">
            A receipt commits to a dataset&apos;s hash, so there has to be a
            dataset first.
          </p>
          <Link
            href="/dashboard/data"
            className="mt-5 inline-flex items-center rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate"
          >
            Upload a dataset
          </Link>
        </div>
      </Card>
    );
  }

  const form = (
      <form onSubmit={submit} className="space-y-4">
        {/* When the caller fixed the dataset, the hash is the only part worth
            restating — it is what the receipt commits to, and the row above
            already said which dataset this is. */}
        {fixed ? (
          <p
            className="truncate font-mono text-[0.6875rem] text-ink-faint"
            title={fixed.sha256}
          >
            sha256 {fixed.sha256}
          </p>
        ) : (
          <Field label="Dataset" htmlFor={`consent-dataset-${uid}`}>
            <select
              id={`consent-dataset-${uid}`}
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              disabled={busy || datasets === null}
              required
              className="w-full rounded-lg border border-rule bg-paper-raised px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-rule-strong disabled:opacity-50"
            >
              <option value="">
                {datasets === null ? "Loading your datasets…" : "Pick a dataset"}
              </option>
              {datasets?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} · {sourceLabel(d.source_type)} ·{" "}
                  {formatBytes(d.byte_size)}
                </option>
              ))}
            </select>
            {dataset && (
              <p
                className="mt-1.5 truncate font-mono text-[0.6875rem] text-ink-faint"
                title={dataset.sha256}
              >
                sha256 {dataset.sha256}
              </p>
            )}
          </Field>
        )}

        <Field
          label="Buyer"
          htmlFor={`consent-buyer-${uid}`}
          hint="The Stellar address allowed to use it"
        >
          <input
            id={`consent-buyer-${uid}`}
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
            placeholder="G…"
            spellCheck={false}
            disabled={busy}
            required
            className="w-full rounded-lg border border-rule bg-paper-raised px-3 py-2 font-mono text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-rule-strong disabled:opacity-50"
          />
        </Field>

        <Field
          label="Purpose"
          htmlFor={`consent-purpose-${uid}`}
          hint={`What they may use it for · ${purpose.length}/${MAX_PURPOSE_LEN}`}
        >
          <input
            id={`consent-purpose-${uid}`}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value.slice(0, MAX_PURPOSE_LEN))}
            placeholder="LLM pre-training"
            disabled={busy}
            required
            className="w-full rounded-lg border border-rule bg-paper-raised px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-rule-strong disabled:opacity-50"
          />
        </Field>

        <Field
          label="Ends"
          htmlFor={`consent-expires-${uid}`}
          hint="Consent always has an end date"
        >
          <input
            id={`consent-expires-${uid}`}
            type="date"
            value={expires}
            min={isoDateIn(1)}
            onChange={(e) => setExpires(e.target.value)}
            disabled={busy}
            required
            className="w-full rounded-lg border border-rule bg-paper-raised px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-rule-strong disabled:opacity-50"
          />
        </Field>

        {error && (
          <p className="rounded-xl border border-rule bg-paper-raised px-4 py-3 text-sm text-ink-dim">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !dataset || !expires}
          className="inline-flex w-full items-center justify-center rounded-lg bg-slate-deep px-4 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate disabled:opacity-50 sm:w-auto"
        >
          {step === "building" && "Preparing…"}
          {step === "signing" && "Waiting for your wallet…"}
          {step === "sending" && "Recording on Stellar…"}
          {step === "idle" && "Sign the receipt"}
        </button>
      </form>
  );

  if (bare) return form;

  return (
    <Card
      title="Grant consent"
      subtitle="Sign a receipt for one dataset, one buyer, one purpose"
    >
      {form}
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 flex items-baseline justify-between gap-3 text-xs font-medium text-ink"
      >
        {label}
        {hint && <span className="font-normal text-ink-faint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
