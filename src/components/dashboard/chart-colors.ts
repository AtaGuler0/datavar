/**
 * Fixed hue per source category — colour follows the entity, never its rank,
 * so filtering a period can't repaint a source. The eight hues are the
 * dataviz reference categorical theme in its dark steps, validated against
 * the night ground (#090a0b) in this order: lightness band, chroma floor,
 * contrast (all eight >= 3:1) and adjacent-pair separation all pass. The
 * worst CVD pair (media ↔ location, ΔE 8.4) clears the target, and every
 * chart that uses these still carries a visible text label per entity —
 * colour is never the only carrier.
 */
export const SOURCE_COLORS: Record<string, string> = {
  browsing: "#3987e5",
  purchases: "#008300",
  health: "#d55181",
  location: "#c98500",
  media: "#199e70",
  voice: "#d95926",
  messaging: "#9085e9",
  dashcam: "#e66767",
};

/** The fold bucket ("Other") and any source without a slot: neutral, not a hue. */
export const FOLD_COLOR = "#7c7c7c";
