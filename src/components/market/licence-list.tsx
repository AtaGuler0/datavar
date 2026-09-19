"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/dashboard/wallet-provider";
import { WalletGate } from "@/components/dashboard/wallet-gate";
import { SESSION_NOW } from "@/lib/clock";
import { formatBytes, formatDate } from "@/lib/format";
import {
  explorerContractUrl,
  explorerTxUrl,
  formatAmount,
} from "@/lib/stellar/config";
import { CONSENT_CONTRACT_ID } from "@/lib/stellar/config";
import { sourceLabel } from "@/lib/supabase/datasets";
import {
  licensedDownloadUrl,
  listLicences,
  readBuyerProfile,
  type BuyerProfile,
  type Licence,
} from "@/lib/supabase/market";
import { BuyerProfileForm } from "./buyer-profile";

/**
 * What a buyer holds.
 *
 * This is the one surface in the product where a buyer sees a dataset's own
 * title, and it is the one place they have earned it: they paid for the file.
 * Everything else here is the paperwork a licence is actually made of — the
 * receipt it stands on, the payment that bought it, and the date it stops.
 *
 * The download is a plain button rather than a link with a URL in it, because
 * the URL does not exist until the database has agreed to make one. Storage
 * asks whether a sale names this wallet and whether the licence has run out;
 * an expired licence produces an error, not a file.
 */
export function LicenceList() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div>
        <p className="eyebrow text-ink-faint">Marketplace</p>
        <h1 className="display mt-3 text-[1.75rem] font-medium text-balance text-ink sm:text-[2.25rem]">
          Your licences
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-ink-dim">
          Every dataset you have licensed, the consent receipt behind it, and
          the payment that bought it.
        </p>
      </div>

      <WalletGate message="Connect the wallet you licensed with to see what it holds.">
        <Licences />
      </WalletGate>
    </div>
  );
}

function Licences() {
  const { address } = useWallet();
  const [rows, setRows] = useState<Licence[] | null>(null);
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!address) return;
    let current = true;
    listLicences(address)
      .then((data) => current && setRows(data))
      .catch(() => current && setFailed(true));
    readBuyerProfile(address)
      .then((row) => current && setProfile(row))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [address]);

  if (failed) {
    return (
      <p className="mt-10 rounded-2xl border border-dashed border-rule-strong bg-paper/60 px-6 py-14 text-center text-pretty text-ink-dim">
        Couldn&rsquo;t read your licences. That is the database refusing or
        unreachable, not an empty shelf.
      </p>
    );
  }

  return (
    <div className="mt-10 space-y-8">
      <section className="rounded-2xl border border-rule bg-paper p-5 shadow-sm shadow-ink/[0.03]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-ink">Buyer details</h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              {profile
                ? `${profile.org} · ${profile.contact}`
                : "Not filed yet. Licensing asks for this once."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="shrink-0 text-xs text-ink-faint transition-colors hover:text-ink"
          >
            {editing ? "Cancel" : profile ? "Edit" : "Add"}
          </button>
        </div>

        {editing && address && (
          <div className="mt-4 border-t border-rule pt-4">
            <BuyerProfileForm
              wallet={address}
              profile={profile}
              onSaved={(saved) => {
                setProfile(saved);
                setEditing(false);
              }}
            />
          </div>
        )}
      </section>

      {rows === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-rule bg-paper"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-rule-strong bg-paper/60 px-6 py-16 text-center">
          <p className="text-pretty text-ink-dim">
            This wallet holds no licences yet.
          </p>
          <Link
            href="/market"
            className="mt-5 inline-block rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-slate"
          >
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((licence) => (
            <LicenceRow key={licence.id} licence={licence} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LicenceRow({ licence }: { licence: Licence }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataset = licence.datasets;
  const expired =
    licence.licence_expires_at !== null &&
    new Date(licence.licence_expires_at).getTime() <= SESSION_NOW;

  const download = useCallback(async () => {
    if (!dataset || busy) return;
    setBusy(true);
    setError(null);
    try {
      const url = await licensedDownloadUrl(dataset.storage_path);
      window.location.href = url;
    } catch {
      setError(
        expired
          ? "This licence has run out, so storage no longer hands the file over."
          : "The file didn't come back. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }, [dataset, busy, expired]);

  return (
    <li className="rounded-2xl border border-rule bg-paper p-5 shadow-sm shadow-ink/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-[0.9375rem] font-medium text-ink">
            {dataset?.title ?? "Dataset"}
          </h3>
          <p className="mt-0.5 text-xs text-ink-faint">
            {dataset ? sourceLabel(dataset.source_type) : "—"}
            {dataset && (
              <>
                <span className="mx-1.5">·</span>
                {formatBytes(dataset.byte_size)}
              </>
            )}
            <span className="mx-1.5">·</span>
            licensed {formatDate(licence.created_at)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm tabular-nums text-ink-dim">
            {formatAmount(licence.price_stroops, licence.asset)}{" "}
            <span className="font-mono text-[0.625rem] text-ink-faint">
              {licence.asset}
            </span>
          </span>
          <button
            type="button"
            onClick={download}
            disabled={busy || !dataset || expired}
            className="rounded-lg bg-slate-deep px-3.5 py-1.5 text-xs font-medium text-paper transition-colors hover:bg-slate disabled:opacity-50"
          >
            {expired ? "Expired" : busy ? "Preparing…" : "Download"}
          </button>
        </div>
      </div>

      {licence.purpose && (
        <p className="mt-3 text-pretty text-[0.8125rem] text-ink-dim">
          <span className="text-ink-faint">Licensed for: </span>
          {licence.purpose}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule pt-3 font-mono text-[0.625rem] text-ink-faint">
        <span>
          Runs to{" "}
          <span className={expired ? "text-fall" : "text-ink-dim"}>
            {licence.licence_expires_at
              ? formatDate(licence.licence_expires_at)
              : "—"}
          </span>
        </span>
        {licence.consent_receipt_id !== null && CONSENT_CONTRACT_ID && (
          <a
            href={explorerContractUrl(CONSENT_CONTRACT_ID)}
            target="_blank"
            rel="noreferrer"
            className="text-slate underline-offset-4 hover:underline"
          >
            receipt #{licence.consent_receipt_id}
          </a>
        )}
        {licence.fund_tx && (
          <a
            href={explorerTxUrl(licence.fund_tx)}
            target="_blank"
            rel="noreferrer"
            className="truncate text-slate underline-offset-4 hover:underline"
          >
            payment {licence.fund_tx.slice(0, 10)}…
          </a>
        )}
        {dataset && <span className="truncate">sha256 {dataset.sha256.slice(0, 12)}…</span>}
      </div>

      {error && <p className="mt-3 text-sm text-fall">{error}</p>}
    </li>
  );
}
