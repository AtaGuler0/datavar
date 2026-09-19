"use client";

import { formatBytes, formatDate } from "@/lib/format";
import { formatAmount, type PayAsset } from "@/lib/stellar/config";
import { sourceLabel } from "@/lib/supabase/datasets";
import {
  formatGroupOf,
  formatLabel,
  priceOf,
  type Listing,
} from "@/lib/supabase/market";

/**
 * One listing.
 *
 * There is no title here and that is deliberate — see the comment on
 * `market_listings` in schema.sql. A dataset's name is what a contributor
 * wrote in their own dashboard about a file from their own life, and the
 * catalogue sells on what it can stand behind instead: the category, the
 * format, the size, when it was contributed, what the consent permits and how
 * long it has left.
 *
 * The receipt id is shown in full because it is the point. It resolves on the
 * consent contract, so a buyer can check the permission they are about to pay
 * for without taking our word for any of this.
 */
export function ListingCard({
  listing,
  asset,
  inBasket,
  licensed,
  onToggle,
}: {
  listing: Listing;
  /** The currency the catalogue is being shown in, and paid in. */
  asset: PayAsset;
  inBasket: boolean;
  licensed: boolean;
  onToggle: () => void;
}) {
  const format = formatGroupOf(listing.content_type);
  const expires = new Date(listing.consent_expires_at);
  const daysLeft = Math.max(
    0,
    Math.ceil((expires.getTime() - Date.now()) / 86_400_000),
  );

  return (
    <article className="flex flex-col rounded-2xl border border-rule bg-paper p-5 shadow-sm shadow-ink/[0.03] transition-colors hover:border-rule-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[0.9375rem] font-medium text-ink">
            {sourceLabel(listing.source_type)}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[0.6875rem] text-ink-faint">
            <span>
              {format
                ? formatLabel(format)
                : (listing.content_type ?? "Unknown format")}
            </span>
            {/* What the upload check found, or that there wasn't one. Said on
                every card rather than only on the good ones: "checked" means
                nothing if its absence is invisible. */}
            <span
              className={`rounded border px-1.5 py-0.5 ${
                listing.scan_status === "clean"
                  ? "border-rise/30 text-rise"
                  : "border-rule text-ink-faint"
              }`}
              title={
                listing.scan_status === "clean"
                  ? "Checked in the contributor's browser at upload: no generator metadata, not a screenshot, not empty."
                  : "Filed before uploads were checked."
              }
            >
              {listing.scan_status === "clean" ? "checked" : "unchecked"}
            </span>
          </p>
        </div>
        <p className="shrink-0 text-right">
          <span className="text-lg font-medium tabular-nums text-ink">
            {formatAmount(priceOf(listing, asset), asset)}
          </span>
          <span className="ml-1 font-mono text-[0.625rem] text-ink-faint">
            {asset}
          </span>
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[0.8125rem]">
        <Field label="Size" value={formatBytes(listing.byte_size)} />
        <Field label="Contributed" value={formatDate(listing.created_at)} />
        <Field
          label="Consent runs to"
          value={`${formatDate(listing.consent_expires_at)} · ${daysLeft}d`}
        />
        <Field
          label="Licensed"
          value={
            listing.licences_sold === 0
              ? "Not yet"
              : `${listing.licences_sold}×`
          }
        />
      </dl>

      <p className="mt-4 line-clamp-2 text-pretty text-[0.8125rem] text-ink-dim">
        <span className="text-ink-faint">Purpose: </span>
        {listing.consent_purpose}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-rule pt-4">
        <p className="min-w-0 font-mono text-[0.625rem] text-ink-faint">
          <span title="An opaque, stable id for the contributor. It is a salted digest, not an address.">
            {listing.contributor_id.slice(0, 8)}
          </span>
          <span className="mx-1.5">·</span>
          <span title="The consent receipt on-chain that makes this listing possible.">
            receipt #{listing.consent_receipt_id}
          </span>
        </p>

        {licensed ? (
          <span className="shrink-0 rounded-lg border border-rule bg-paper-raised px-3 py-1.5 text-xs text-ink-dim">
            Licensed
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className={`shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              inBasket
                ? "border border-rule-strong bg-paper-raised text-ink"
                : "bg-slate-deep text-paper hover:bg-slate"
            }`}
          >
            {inBasket ? "Remove" : "Add"}
          </button>
        )}
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] text-ink-faint">{label}</dt>
      <dd className="truncate text-ink-dim tabular-nums">{value}</dd>
    </div>
  );
}
