/** Human byte sizes: 940 B, 12.4 KB, 3.1 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

/** 1284 → "1,284". Pinned to en-US so SSR and client agree. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * Percent change against a prior period. `"new"` means there was nothing to
 * compare against, `null` means both sides were empty — neither is a 0%.
 */
export function percentDelta(cur: number, prev: number): number | "new" | null {
  if (prev === 0) return cur === 0 ? null : "new";
  return ((cur - prev) / prev) * 100;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** 2026-07-19 → "19 Jul 2026". Locale-independent so SSR and client agree. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * "19 Jul · 14:00" — an intraday bucket edge, in the reader's own timezone.
 * Only ever rendered inside charts that are client-fetched, so the local
 * clock can't disagree with a prerender.
 */
export function formatHour(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${hh}:00`;
}
