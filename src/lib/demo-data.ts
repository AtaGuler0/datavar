import { SIMULATED_BUYERS, randomPriceStroops } from "./sales";
import type { SourceTypeId } from "./supabase/datasets";

/**
 * Plausible contributions, for filling an empty deployment.
 *
 * A protocol with nothing in it is impossible to judge: every chart is a flat
 * line, every table is an empty state, and no screen shows what it looks like
 * when it is doing its job. This generates the kind of rows a real contributor
 * would produce, so the product can be looked at rather than imagined.
 *
 * Everything here is invented and marked as such — seeded datasets carry a
 * `seed/` storage path, which is both how they are recognised and how they are
 * removed. Nothing generated here is ever presented as a real contribution.
 */

/** Titles a real person might give a dataset, per category. */
const TITLES: Record<SourceTypeId, string[]> = {
  browsing: [
    "Chrome history, 2024–2026",
    "Search queries, 18 months",
    "Firefox browsing archive",
    "Reading history, two years",
  ],
  purchases: [
    "Amazon order history",
    "Grocery receipts, 2025",
    "Card statements, two years",
    "Marketplace purchases, 14 months",
  ],
  health: [
    "Apple Health export",
    "Garmin activity log",
    "Sleep tracking, 14 months",
    "Continuous heart rate, 6 months",
  ],
  location: [
    "Google Timeline, 2024–2025",
    "Commute traces, 9 months",
    "Weekend movement, one year",
  ],
  media: [
    "Spotify streaming history",
    "Netflix viewing log",
    "YouTube watch history",
    "Podcast listening, two years",
  ],
  voice: [
    "Voice memos, 200 clips",
    "Read-aloud corpus, 3 hours",
    "Dictation samples, accented English",
  ],
  messaging: [
    "WhatsApp metadata export",
    "SMS timestamps, two years",
    "Group chat metadata, no content",
  ],
  dashcam: [
    "Dashcam clips, motorway",
    "Helmet cam, 40 cycle rides",
    "Urban driving, rainy conditions",
  ],
  other: [
    "Smart meter readings",
    "Home air quality log",
    "Keystroke timing samples",
  ],
};

/**
 * Byte ranges per category, in MB. Kept under the product's own 50 MB upload
 * limit — seeded rows that could not have been uploaded would make every size
 * figure a lie about what the product accepts.
 */
const SIZES_MB: Record<SourceTypeId, [number, number]> = {
  browsing: [0.4, 12],
  purchases: [0.2, 6],
  health: [1, 24],
  location: [0.5, 18],
  media: [0.3, 9],
  voice: [4, 45],
  messaging: [0.1, 5],
  dashcam: [8, 48],
  other: [0.2, 8],
};

const CATEGORIES = Object.keys(TITLES) as SourceTypeId[];

const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)];

const between = (min: number, max: number) => min + Math.random() * (max - min);

/** 64 hex characters. Not a digest of anything — nothing was hashed. */
function fakeSha256(): string {
  let out = "";
  for (let i = 0; i < 64; i++) out += "0123456789abcdef"[Math.floor(Math.random() * 16)];
  return out;
}

/**
 * A moment in the last `days`, weighted towards now. Squaring a uniform draw
 * puts more contributions in recent weeks, which is what a growing protocol
 * looks like — spreading them evenly would draw a flat chart that says
 * nothing.
 */
function recentDate(days: number): string {
  const share = Math.random() ** 2;
  const ms = Date.now() - share * days * 86_400_000;
  return new Date(ms).toISOString();
}

export type DemoDataset = {
  owner_wallet: string;
  title: string;
  source_type: SourceTypeId;
  description: string | null;
  sha256: string;
  byte_size: number;
  content_type: string;
  storage_path: string;
  synthetic: boolean;
  created_at: string;
};

/** One invented dataset for a wallet. */
export function demoDataset(wallet: string, days: number): DemoDataset {
  const source = pick(CATEGORIES);
  const [min, max] = SIZES_MB[source];
  const sha256 = fakeSha256();

  return {
    owner_wallet: wallet,
    title: pick(TITLES[source]),
    source_type: source,
    description: null,
    sha256,
    byte_size: Math.round(between(min, max) * 1024 * 1024),
    content_type: "application/octet-stream",
    // The marker. Everything seeded lives under this prefix, and the cleanup
    // SQL keys off it — no other row in the table can start with it, because
    // real uploads are namespaced by wallet address.
    storage_path: `seed/${wallet}/${sha256}`,
    // The other marker, and the one the public aggregates read. The prefix
    // above says how to delete these rows; this says they are not adoption.
    // Until this column existed the two claims in this file's own docstring —
    // that nothing here is ever presented as a real contribution, and that the
    // landing page counts every dataset row — could not both be true.
    synthetic: true,
    created_at: recentDate(days),
  };
}

export type DemoSale = {
  dataset_id: string;
  owner_wallet: string;
  buyer: string;
  price_stroops: number;
  status: "unclaimed" | "claimed";
  claimed_at: string | null;
  created_at: string;
};

/**
 * A sale of a dataset, some time after it was contributed.
 *
 * A claimed one carries no transaction hash, because no payment was made. The
 * alternative — inventing a hash — would put a link on the earnings page that
 * resolves to nothing on the explorer, which is the one thing the payout view
 * exists to make impossible.
 */
export function demoSale(
  dataset: { id: string; owner_wallet: string; created_at: string },
  claimed: boolean,
): DemoSale {
  const contributedAt = new Date(dataset.created_at).getTime();
  const soldAt = contributedAt + between(0.2, 1) * (Date.now() - contributedAt);

  return {
    dataset_id: dataset.id,
    owner_wallet: dataset.owner_wallet,
    buyer: pick(SIMULATED_BUYERS),
    price_stroops: randomPriceStroops(),
    status: claimed ? "claimed" : "unclaimed",
    claimed_at: claimed
      ? new Date(soldAt + between(0.1, 0.6) * (Date.now() - soldAt)).toISOString()
      : null,
    created_at: new Date(soldAt).toISOString(),
  };
}

/** The SQL that removes everything this module ever created. */
export const CLEANUP_SQL = `delete from public.sales
where dataset_id in (
  select id from public.datasets where storage_path like 'seed/%'
);

delete from public.datasets where storage_path like 'seed/%';`;
