"use client";

import { useEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/format";
import {
  createDataset,
  hashFile,
  SOURCE_TYPES,
  type Dataset,
  type SourceTypeId,
} from "@/lib/supabase/datasets";
import { DatasetList } from "./dataset-list";
import { useWallet } from "./wallet-provider";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — plenty for a testnet demo.

type Staged = { file: File; sha256: string };

export function UploadFlow() {
  const { address } = useWallet();

  const [staged, setStaged] = useState<Staged | null>(null);
  const [hashing, setHashing] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<SourceTypeId>("browsing");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The list is owned here so a successful upload can prepend without a refetch.
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStaged(null);
    setTitle("");
    setSourceType("browsing");
    setDescription("");
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(`That file is ${formatBytes(file.size)}. The limit is 50 MB.`);
      return;
    }
    setHashing(true);
    try {
      const sha256 = await hashFile(file);
      setStaged({ file, sha256 });
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch {
      setError("Couldn't read that file. Try another.");
    } finally {
      setHashing(false);
    }
  };

  const submit = async () => {
    if (!address || !staged || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createDataset({
        wallet: address,
        title,
        sourceType,
        description,
        file: staged.file,
      });
      setDatasets((prev) => [created, ...(prev ?? [])]);
      reset();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Upload failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-10 space-y-12">
      <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-sm shadow-ink/[0.03]">
        <div className="border-b border-rule px-6 py-4">
          <p className="eyebrow text-ink-faint">Contribute a dataset</p>
        </div>

        <div className="space-y-7 p-6 sm:p-7">
          {/* File + on-device hash */}
          <div>
            <label className="text-sm font-medium text-ink">File</label>
            <p className="mt-1 text-sm text-ink-faint">
              Hashed on your device before anything leaves. Up to 50 MB.
            </p>

            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />

            {!staged ? (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={hashing}
                className="mt-3 flex w-full items-center justify-center rounded-xl border border-dashed border-rule-strong bg-paper-raised/40 px-6 py-8 text-sm text-ink-dim transition-colors hover:border-slate/40 hover:text-ink disabled:opacity-70"
              >
                {hashing ? "Hashing…" : "Choose a file"}
              </button>
            ) : (
              <div className="mt-3 rounded-xl border border-rule bg-paper-raised/50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">
                      {staged.file.name}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-ink-faint">
                      {formatBytes(staged.file.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={reset}
                    className="shrink-0 text-sm text-ink-faint transition-colors hover:text-ink"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 border-t border-rule pt-3">
                  <p className="eyebrow text-ink-faint">SHA-256</p>
                  <p className="mt-1 break-all font-mono text-xs text-ink-dim">
                    {staged.sha256}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="ds-title" className="text-sm font-medium text-ink">
                Title
              </label>
              <input
                id="ds-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Two years of browsing history"
                className="mt-2 w-full rounded-lg border border-rule bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-slate/50 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="ds-source" className="text-sm font-medium text-ink">
                Source
              </label>
              <select
                id="ds-source"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceTypeId)}
                className="mt-2 w-full rounded-lg border border-rule bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-slate/50 focus:outline-none"
              >
                {SOURCE_TYPES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ds-desc" className="text-sm font-medium text-ink">
                Description{" "}
                <span className="font-normal text-ink-faint">optional</span>
              </label>
              <input
                id="ds-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's in it?"
                className="mt-2 w-full rounded-lg border border-rule bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-slate/50 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-rule bg-paper-raised/60 px-3.5 py-2.5 text-sm text-ink-dim">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-4 border-t border-rule pt-6">
            <p className="text-xs text-ink-faint">
              The file goes to your private store. The receipt comes next.
            </p>
            <button
              type="button"
              onClick={submit}
              disabled={!staged || !title.trim() || submitting || hashing}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-deep px-5 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate disabled:opacity-50"
            >
              {submitting ? "Uploading…" : "Upload dataset"}
            </button>
          </div>
        </div>
      </div>

      <UploadedSection
        datasets={datasets}
        setDatasets={setDatasets}
        wallet={address}
      />
    </div>
  );
}

/** Loads the wallet's datasets once, then reflects local additions. */
function UploadedSection({
  datasets,
  setDatasets,
  wallet,
}: {
  datasets: Dataset[] | null;
  setDatasets: (d: Dataset[]) => void;
  wallet: string | null;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet || datasets !== null) return;
    let active = true;
    import("@/lib/supabase/datasets").then(({ listDatasets }) =>
      listDatasets(wallet)
        .then((rows) => active && setDatasets(rows))
        .catch(() => active && setError("Couldn't load your datasets.")),
    );
    return () => {
      active = false;
    };
  }, [wallet, datasets, setDatasets]);

  return (
    <div>
      <p className="eyebrow text-ink-faint">Your datasets</p>
      {error ? (
        <p className="mt-4 text-sm text-ink-dim">{error}</p>
      ) : (
        <DatasetList datasets={datasets} />
      )}
    </div>
  );
}
