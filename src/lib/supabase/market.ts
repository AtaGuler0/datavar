import type { PayAsset } from "@/lib/stellar/config";
import { DATASETS_BUCKET, supabase } from "./client";

/**
 * The buy side, from the browser.
 *
 * Everything here reads two views and two tables, and the split between them
 * is the privacy line: `market_listings` is what anyone may see, and it holds
 * no title, no description and no contributor address. `sales` and `datasets`
 * are what a buyer may see about the rows they have actually licensed, and
 * row-level security — not this file — is what decides that.
 *
 * Filtering runs in Postgres rather than here. A catalogue that pulls every
 * listing into the browser and filters it with `Array.prototype.filter` works
 * at 525 rows and stops working at the first number worth bragging about, and
 * the fix would be the same rewrite this avoids.
 */

/** One row of the catalogue. Mirrors `market_listings` in schema.sql. */
export type Listing = {
  id: string;
  /** Salted digest of the owner, stable and one-way — see the view. */
  contributor_id: string;
  source_type: string;
  byte_size: number;
  content_type: string | null;
  created_at: string;
  /** The listed price in XLM stroops. */
  price_stroops: number;
  /** The listed price in USDC units, which are the same size. */
  price_usdc: number;
  /**
   * What the upload scanner made of the file. `clean` means it was checked in
   * the contributor's browser and nothing was found against it; `unscanned`
   * means it was filed before that check existed. Flagged datasets are not in
   * this view at all.
   */
  scan_status: "unscanned" | "clean";
  scanned_at: string | null;
  /** The on-chain receipt this listing stands on. */
  consent_receipt_id: number;
  consent_purpose: string;
  consent_granted_at: string;
  consent_expires_at: string;
  licences_sold: number;
  last_licensed_at: string | null;
};

/** Per-category totals, for the filter rail. Mirrors `market_facets`. */
export type Facet = {
  source_type: string;
  listings: number;
  /** Of those, the ones checked at upload. */
  scanned: number;
  min_price_stroops: number;
  max_price_stroops: number;
  min_price_usdc: number;
  max_price_usdc: number;
  min_bytes: number;
  max_bytes: number;
  newest: string;
};

/**
 * File families a buyer actually thinks in. Content types are recorded exactly
 * as the browser reported them at upload, which is the right thing to store and
 * the wrong thing to put in a filter: nobody is shopping for `audio/mp4`.
 */
export const FORMAT_GROUPS = [
  { id: "image", label: "Images", patterns: ["image/%"] },
  { id: "video", label: "Video", patterns: ["video/%"] },
  { id: "audio", label: "Audio", patterns: ["audio/%"] },
  {
    id: "tabular",
    label: "Tabular & JSON",
    patterns: ["text/csv%", "application/json%", "text/tab%", "application/x-ndjson%"],
  },
  {
    id: "text",
    label: "Text & documents",
    patterns: ["text/plain%", "text/html%", "text/markdown%", "application/pdf%", "application/xml%", "text/xml%"],
  },
  {
    id: "archive",
    label: "Archives & exports",
    patterns: ["application/zip%", "application/gzip%", "application/x-tar%", "application/x-7z%", "application/vnd.sqlite3%", "application/octet-stream%"],
  },
] as const;

export type FormatGroupId = (typeof FORMAT_GROUPS)[number]["id"];

export function formatLabel(id: string): string {
  return FORMAT_GROUPS.find((g) => g.id === id)?.label ?? id;
}

/** The family a stored content type belongs to, for a row already in hand. */
export function formatGroupOf(contentType: string | null): FormatGroupId | null {
  if (!contentType) return null;
  const type = contentType.toLowerCase();
  const match = FORMAT_GROUPS.find((group) =>
    group.patterns.some((pattern) => type.startsWith(pattern.replace("%", ""))),
  );
  return match?.id ?? null;
}

/** Which column a price means, for the currency the catalogue is showing. */
export function priceColumn(asset: PayAsset): "price_stroops" | "price_usdc" {
  return asset === "USDC" ? "price_usdc" : "price_stroops";
}

/** What a listing costs in the currency being shown. */
export function priceOf(listing: Listing, asset: PayAsset): number {
  return Number(asset === "USDC" ? listing.price_usdc : listing.price_stroops);
}

export const SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "size-desc", label: "Largest first" },
  { id: "demand", label: "Most licensed" },
] as const;

export type SortId = (typeof SORTS)[number]["id"];

export type ListingFilters = {
  /**
   * The currency the catalogue is priced in, which is also the one a basket
   * will be paid in. Not a display preference: the price band below is read
   * against this column, and the checkout funds the vault that holds it.
   */
  asset: PayAsset;
  /** Source categories, as in SOURCE_TYPES. Empty means every category. */
  sources: string[];
  /** File families, as in FORMAT_GROUPS. Empty means every format. */
  formats: string[];
  /** Price band in stroops, inclusive. */
  minPrice?: number;
  maxPrice?: number;
  /** Size band in bytes, inclusive. */
  minBytes?: number;
  maxBytes?: number;
  /** Contributed no earlier than this many days ago. */
  freshDays?: number;
  /** Consent that still has at least this many days to run. */
  consentDays?: number;
  /** Only datasets nobody has licensed yet. */
  unlicensedOnly?: boolean;
  /** Only datasets that passed the upload check. */
  scannedOnly?: boolean;
  sort: SortId;
};

export const DEFAULT_FILTERS: ListingFilters = {
  asset: "XLM",
  sources: [],
  formats: [],
  sort: "newest",
};

export const PAGE_SIZE = 24;

/** Days → the ISO timestamp Postgres compares `created_at` against. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function daysAhead(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/**
 * A page of the catalogue, and how many rows the filters match in total.
 *
 * The count is exact rather than estimated because it is shown as a number of
 * datasets a buyer could license, and a filter that says "about 400" is a
 * filter nobody trusts twice.
 */
export async function listListings(
  filters: ListingFilters,
  page = 0,
): Promise<{ rows: Listing[]; total: number }> {
  let query = supabase.from("market_listings").select("*", { count: "exact" });

  if (filters.sources.length > 0) {
    query = query.in("source_type", filters.sources);
  }

  if (filters.formats.length > 0) {
    // One `or` across every pattern in every chosen family. PostgREST wants
    // `*` as its wildcard inside an or-filter, hence the swap.
    const patterns = filters.formats.flatMap(
      (id) => FORMAT_GROUPS.find((g) => g.id === id)?.patterns ?? [],
    );
    if (patterns.length > 0) {
      query = query.or(
        patterns.map((p) => `content_type.like.${p.replace(/%/g, "*")}`).join(","),
      );
    }
  }

  const price = priceColumn(filters.asset);
  if (filters.minPrice !== undefined) {
    query = query.gte(price, filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    query = query.lte(price, filters.maxPrice);
  }
  if (filters.minBytes !== undefined) {
    query = query.gte("byte_size", filters.minBytes);
  }
  if (filters.maxBytes !== undefined) {
    query = query.lte("byte_size", filters.maxBytes);
  }
  if (filters.freshDays) {
    query = query.gte("created_at", daysAgo(filters.freshDays));
  }
  if (filters.consentDays) {
    query = query.gte("consent_expires_at", daysAhead(filters.consentDays));
  }
  if (filters.unlicensedOnly) {
    query = query.eq("licences_sold", 0);
  }
  if (filters.scannedOnly) {
    query = query.eq("scan_status", "clean");
  }

  switch (filters.sort) {
    case "price-asc":
      query = query.order(price, { ascending: true });
      break;
    case "price-desc":
      query = query.order(price, { ascending: false });
      break;
    case "size-desc":
      query = query.order("byte_size", { ascending: false });
      break;
    case "demand":
      query = query
        .order("licences_sold", { ascending: false })
        .order("created_at", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  // A stable tiebreak, so page two never repeats a row from page one when two
  // listings share a price or a timestamp.
  query = query.order("id", { ascending: true });

  const { data, count, error } = await query.range(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE - 1,
  );

  if (error) throw error;
  return { rows: (data ?? []) as Listing[], total: count ?? 0 };
}

/** Listing counts and ranges per category, for the filter rail's ceilings. */
export async function listFacets(): Promise<Facet[]> {
  const { data, error } = await supabase.from("market_facets").select("*");
  if (error) throw error;
  return (data ?? []) as Facet[];
}

/** Several listings by id, for the basket after a page change drops them. */
export async function listingsByIds(ids: string[]): Promise<Listing[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("market_listings")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as Listing[];
}

/** Who a buyer says they are. One row, their own. */
export type BuyerProfile = {
  wallet: string;
  org: string;
  contact: string;
  intent: string | null;
  created_at: string;
  updated_at: string;
};

export async function readBuyerProfile(
  wallet: string,
): Promise<BuyerProfile | null> {
  const { data, error } = await supabase
    .from("buyers")
    .select("*")
    .eq("wallet", wallet)
    .maybeSingle();

  if (error) throw error;
  return (data as BuyerProfile) ?? null;
}

export async function saveBuyerProfile(input: {
  wallet: string;
  org: string;
  contact: string;
  intent: string;
}): Promise<BuyerProfile> {
  const { data, error } = await supabase
    .from("buyers")
    .upsert(
      {
        wallet: input.wallet,
        org: input.org.trim(),
        contact: input.contact.trim(),
        intent: input.intent.trim() || null,
      },
      { onConflict: "wallet" },
    )
    .select()
    .single();

  if (error) throw error;
  return data as BuyerProfile;
}

/** A licence the signed-in buyer holds, with the dataset it covers. */
export type Licence = {
  id: string;
  dataset_id: string;
  price_stroops: number;
  asset: PayAsset;
  purpose: string | null;
  licence_expires_at: string | null;
  fund_tx: string | null;
  consent_receipt_id: number | null;
  created_at: string;
  datasets: {
    title: string;
    source_type: string;
    byte_size: number;
    content_type: string | null;
    sha256: string;
    storage_path: string;
  } | null;
};

/**
 * Everything this wallet has licensed. The embed is the point: a buyer sees
 * the dataset's own title here and nowhere else, because here they have paid
 * for it — the catalogue they shopped in never showed it.
 */
export async function listLicences(wallet: string): Promise<Licence[]> {
  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, dataset_id, price_stroops, asset, purpose, licence_expires_at, fund_tx, consent_receipt_id, created_at, datasets (title, source_type, byte_size, content_type, sha256, storage_path)",
    )
    .eq("buyer_wallet", wallet)
    .eq("channel", "market")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as Licence[];
}

/** Dataset ids this wallet already holds a licence for. */
export async function listLicensedIds(wallet: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("sales")
    .select("dataset_id")
    .eq("buyer_wallet", wallet)
    .eq("channel", "market");

  if (error) throw error;
  return (data ?? []).map((row) => row.dataset_id as string);
}

/**
 * One licence, as everybody can see it.
 *
 * Mirrors `market_activity`: the shape of a trade with neither side named.
 * Both ids are salted digests, and the buyer's organisation is deliberately
 * not here — see the view's comment for why.
 */
export type Activity = {
  id: string;
  buyer_id: string;
  contributor_id: string;
  source_type: string;
  byte_size: number;
  content_type: string | null;
  price_stroops: number;
  asset: PayAsset;
  created_at: string;
  licence_expires_at: string | null;
};

/** The same trade, counted. Mirrors `market_pulse`. */
export type Pulse = {
  licences: number;
  buyers: number;
  datasets: number;
  gross_stroops: number;
  gross_usdc: number;
  last_day: number;
  last_at: string | null;
};

export async function listActivity(limit = 8): Promise<Activity[]> {
  const { data, error } = await supabase
    .from("market_activity")
    .select("*")
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Activity[];
}

export async function readPulse(): Promise<Pulse | null> {
  const { data, error } = await supabase
    .from("market_pulse")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return (data as Pulse) ?? null;
}

/** How long a download link stays good. Long enough to click, not to share. */
const SIGNED_URL_SECONDS = 120;

/**
 * A link to the file itself.
 *
 * Storage checks the licence, not this function: the policy on the bucket asks
 * whether a sale exists naming this wallet, and an expired licence produces an
 * error rather than a URL. Which is why the download button is allowed to be a
 * plain button — the answer comes from the database either way.
 */
export async function licensedDownloadUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DATASETS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_SECONDS);

  if (error) throw error;
  return data.signedUrl;
}
