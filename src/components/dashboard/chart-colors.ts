/**
 * Fixed hue per source category — colour follows the entity, never its rank,
 * so filtering a period can't repaint a source. The eight hues are the
 * dataviz reference categorical theme, validated against paper (#fbfaf9):
 * lightness band, chroma floor and CVD separation all pass; three hues sit
 * below 3:1 surface contrast, which is why every chart that uses these also
 * carries a visible text label per entity — colour is never the only carrier.
 */
export const SOURCE_COLORS: Record<string, string> = {
  browsing: "#2a78d6",
  purchases: "#008300",
  health: "#e87ba4",
  location: "#eda100",
  media: "#1baf7a",
  voice: "#eb6834",
  messaging: "#4a3aa7",
  dashcam: "#e34948",
};

/** The fold bucket ("Other") and any source without a slot: neutral, not a hue. */
export const FOLD_COLOR = "#8b91a1";
