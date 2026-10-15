"use client";

import { LicenceShelfFigure } from "../app-figures";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/components/dashboard/wallet-provider";
import { Corners } from "@/components/dashboard/primitives";
import { PillLink } from "@/components/night";
import { MarketPage } from "./chrome";
import { SourceTile } from "./source-tile";
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
  DeliveryRefused,
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
 * the URL does not exist until both the database and the consent contract have
 * agreed to make one. Storage asks whether a sale names this wallet and whether
 * the licence has run out; the route behind the button asks the contract whether
 * the receipt is still good. A withdrawal since the sale produces an explanation
 * here, not a file.
 */
export function LicenceList() {
  return (
    <MarketPage
      section="Your licences"
      title="Your licences."
      aside="What this wallet has bought."
      description="Every dataset you've licensed, with its receipt and its payment."
    >
      <WalletGate message="Connect the wallet you licensed with to see what it holds." figure={<LicenceShelfFigure />}>
        <Licences />
      </WalletGate>
    </MarketPage>
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
      <p className="mt-10 rounded-xl border border-dashed border-line-strong px-6 py-14 text-center text-pretty text-star-dim">
        Couldn&rsquo;t read your licences. That is the database refusing or
        unreachable, not an empty shelf.
      </p>
    );
  }

  return (
    <div className="mt-10 space-y-8">
      <section className="relative rounded-xl border border-line bg-white/[0.018] p-5">
        <Corners />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-mono text-[0.6875rem] tracking-[0.1em] text-star-dim uppercase">Buyer details</h2>
            <p className="mt-1.5 text-[0.875rem] text-star-faint">
              {profile
                ? `${profile.org} · ${profile.contact}`
                : "Not filed yet. Licensing asks for this once."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="shrink-0 font-mono text-[0.6875rem] tracking-[0.08em] text-star-dim uppercase transition-colors hover:text-star"
          >
            {editing ? "Cancel" : profile ? "Edit" : "Add"}
          </button>
        </div>

        {editing && address && (
          <div className="mt-4 border-t border-line pt-4">
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
              className="h-32 animate-pulse rounded-xl border border-line bg-white/[0.02]"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong px-6 py-16 text-center">
          <p className="text-[1.0625rem] text-pretty text-star">
            This wallet holds no licences yet.
          </p>
          <div className="mt-6">
            <PillLink href="/market">Browse the catalogue</PillLink>
          </div>
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
      const url = await licensedDownloadUrl(licence.id);
      window.location.href = url;
    } catch (e) {
      // The route refuses with the reason — withdrawn consent reads nothing
      // like a network blip, and the buyer is the one who has to act on it.
      setError(
        e instanceof DeliveryRefused
          ? e.message
          : "The file didn't come back. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }, [dataset, busy, licence.id]);

  return (
    <li className="relative rounded-xl border border-line bg-white/[0.018] p-5">
      <Corners />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {dataset && <SourceTile source={dataset.source_type} className="h-11 w-12 shrink-0" />}
          <div className="min-w-0">
          <h3 className="truncate text-[1rem] font-medium tracking-[-0.01em] text-star">
            {dataset?.title ?? "Dataset"}
          </h3>
          <p className="mt-1 font-mono text-[0.6875rem] tracking-[0.06em] text-star-faint uppercase">
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
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[1.25rem] font-medium tracking-[-0.03em] text-star tabular-nums">
            {formatAmount(licence.price_stroops, licence.asset)}{" "}
            <span className="font-mono text-[0.6875rem] tracking-normal text-star-faint">
              {licence.asset}
            </span>
          </span>
          <button
            type="button"
            onClick={download}
            disabled={busy || !dataset || expired}
            className="inline-flex h-9 items-center rounded-[10px] bg-star px-4 text-[0.8125rem] font-medium text-night transition-colors hover:bg-white disabled:opacity-50"
          >
            {expired ? "Expired" : busy ? "Preparing…" : "Download"}
          </button>
        </div>
      </div>

      {licence.purpose && (
        <p className="mt-4 text-pretty text-[0.875rem] text-star-dim">
          <span className="text-star-faint">Licensed for · </span>
          {licence.purpose}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-4 font-mono text-[0.6875rem] text-star-faint">
        <span>
          Runs to{" "}
          <span className={expired ? "text-fall" : "text-star-dim"}>
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
            className="text-star-dim underline-offset-4 hover:text-star hover:underline"
          >
            receipt #{licence.consent_receipt_id}
          </a>
        )}
        {licence.fund_tx && (
          <a
            href={explorerTxUrl(licence.fund_tx)}
            target="_blank"
            rel="noreferrer"
            className="truncate text-star-dim underline-offset-4 hover:text-star hover:underline"
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
