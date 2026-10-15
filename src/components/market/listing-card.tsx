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
import { Corners } from "../dashboard/primitives";
import { SourceTile } from "./source-tile";

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
    <article className="group/card relative flex flex-col rounded-xl border border-line bg-white/[0.018] p-5 transition-colors hover:border-line-strong">
      <Corners />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <SourceTile source={listing.source_type} className="h-11 w-12 shrink-0" />
          <div className="min-w-0">
            <h3 className="truncate text-[1rem] font-medium tracking-[-0.01em] text-star">
              {sourceLabel(listing.source_type)}
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[0.6875rem] tracking-[0.06em] text-star-faint uppercase">
              <span>
                {format
                  ? formatLabel(format)
                  : (listing.content_type ?? "Unknown format")}
              </span>
              {/* What the upload check found, or that there wasn't one. Said on
                  every card rather than only on the good ones: "checked" means
                  nothing if its absence is invisible. */}
              <span
                className={`flex items-center gap-1.5 ${
                  listing.scan_status === "clean" ? "text-signal" : "text-star-ghost"
                }`}
                title={
                  listing.scan_status === "clean"
                    ? "Checked in the contributor's browser at upload: no generator metadata, not a screenshot, not empty."
                    : "Filed before uploads were checked."
                }
              >
                · {listing.scan_status === "clean" ? "checked" : "unchecked"}
              </span>
            </p>
          </div>
        </div>
        <p className="shrink-0 text-right">
          <span className="text-[1.625rem] leading-none font-medium tracking-[-0.04em] text-star tabular-nums">
            {formatAmount(priceOf(listing, asset), asset)}
          </span>
          <span className="ml-1.5 font-mono text-[0.6875rem] text-star-faint">
            {asset}
          </span>
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-[0.875rem]">
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

      <p className="mt-4 line-clamp-2 text-pretty text-[0.8125rem] text-star-dim">
        <span className="text-star-faint">Purpose · </span>
        {listing.consent_purpose}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <p className="min-w-0 font-mono text-[0.6875rem] text-star-ghost">
          <span title="An opaque, stable id for the contributor. It is a salted digest, not an address.">
            {listing.contributor_id.slice(0, 8)}
          </span>
          <span className="mx-1.5">·</span>
          <span title="The consent receipt on-chain that makes this listing possible.">
            receipt #{listing.consent_receipt_id}
          </span>
        </p>

        {licensed ? (
          <span className="shrink-0 font-mono text-[0.6875rem] tracking-[0.08em] text-signal uppercase">
            ✓ Licensed
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={inBasket}
            className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] px-4 text-[0.8125rem] font-medium transition-colors ${
              inBasket
                ? "border border-line-strong text-star hover:border-star-faint"
                : "bg-star text-night hover:bg-white"
            }`}
          >
            {inBasket ? "In basket · Remove" : "Add to basket"}
          </button>
        )}
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[0.625rem] tracking-[0.1em] text-star-faint uppercase">{label}</dt>
      <dd className="mt-1 truncate text-star tabular-nums">{value}</dd>
    </div>
  );
}
