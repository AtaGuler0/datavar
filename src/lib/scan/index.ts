import { readMediaStats } from "./media";
import { readHeader, readMetadata, readProvenance } from "./metadata";
import { readPixels } from "./pixels";
import { isScreenSize, looksLikeScreenshotName } from "./screens";
import { readTextStats } from "./text";

/**
 * The door.
 *
 * Until this existed the upload form took anything: a screenshot, a generated
 * picture, an empty CSV, the same file twice. All four are indistinguishable
 * from real contributions once they are rows in a table, and all four are
 * priced, counted and eventually sold like real ones. The cheapest moment to
 * refuse them is before the upload, on the contributor's own machine, while the
 * bytes are still theirs.
 *
 * Three principles, because a filter that gets this wrong costs someone a
 * payout they earned:
 *
 *   * **It runs locally.** No upload, no server, no third-party model. The file
 *     is read in the browser and refused in the browser; a rejected file never
 *     leaves the device. This is also why it is cheap enough to run on every
 *     upload without anyone noticing.
 *
 *   * **It says what it saw.** Every verdict comes with the evidence that
 *     produced it — the tool named in the metadata, the dimensions that match a
 *     display, the number of rows it counted. A contributor who thinks it is
 *     wrong can read the reason and say so, which is not true of a score.
 *
 *   * **It claims only what it checked.** There is no AI-image detector here,
 *     because a browser cannot honestly run one. What it finds is a file that
 *     *declares* how it was made, in the fields the tools themselves write. A
 *     generated image with its metadata stripped passes, and the wording
 *     throughout says so rather than implying a guarantee.
 *
 * The verdict travels with the dataset (`quality` in schema.sql), and the
 * marketplace will not list anything that failed it.
 */

/** Bumped when the rules change, so old verdicts can be told apart. */
export const SCAN_VERSION = 1;

export type Severity = "reject" | "flag" | "note";

export type FlagId =
  | "declared-synthetic"
  | "generator-metadata"
  | "content-credential"
  | "screenshot"
  | "screen-like"
  | "duplicate"
  | "blank"
  | "low-information"
  | "tiny"
  | "unreadable"
  | "empty-export"
  | "short-clip"
  | "no-capture-metadata";

export type Flag = {
  id: FlagId;
  severity: Severity;
  /** The sentence shown to the contributor. */
  title: string;
  /** What was actually observed, in their file. */
  detail: string;
};

export type ScanReport = {
  /** `rejected` blocks the upload; `flagged` allows it but keeps it off the
   *  marketplace; `clean` is a dataset like any other. */
  status: "clean" | "flagged" | "rejected";
  flags: Flag[];
  /** Short lines of evidence for the panel: dimensions, camera, row counts. */
  facts: string[];
  version: number;
};

/** Ceilings and floors, in one place so they can be argued with. */
const LIMITS = {
  /** An image smaller than this is a thumbnail or an icon, not a dataset. */
  imageBytes: 8 * 1024,
  imageEdge: 320,
  /** Nothing in it: a couple of colours, or no variation in brightness. */
  blankPalette: 8,
  blankContrast: 2,
  /**
   * Nearly nothing in it: a flat background with one object on it, a faint
   * scan, a monochrome graphic. The numbers come from measuring a folder of
   * real files — photographs ran 50–78 contrast across 550–4,000 colours,
   * while studio product shots and scans ran 7–15 across 38–141.
   *
   * Held rather than refused, and that distinction was learned the hard way:
   * the first version rejected these outright, and the files it was rejecting
   * turned out to include a perfectly real photograph of a garment on a white
   * background. A scanned receipt would be the same shape, and a receipt is a
   * purchase record — one of the nine things this product exists to collect.
   */
  emptyContrast: 15,
  emptyPalette: 200,
  /** Interface, not photograph — flat fills, few colours, mostly grey. */
  screenFlatness: 0.65,
  screenPalette: 1_200,
  screenGrey: 0.3,
  /** The same shape, weaker: enough to mark, not enough to refuse. */
  softFlatness: 0.45,
  softPalette: 3_000,
  /** A delimited export needs rows under its header. */
  exportLines: 5,
  textCharacters: 400,
  jsonRecords: 3,
  /** Shorter than this is a slip of the finger, not a recording. */
  clipSeconds: 2,
} as const;

export type ScanInput = {
  file: File;
  /** The digest the upload form has already computed. */
  sha256?: string;
  /** Digests this wallet has filed before — the duplicate test. */
  knownHashes?: Set<string>;
};

/**
 * Reads the file and returns a verdict. Never throws: a file this cannot parse
 * is reported as unreadable, which is a refusal a person can act on, rather
 * than an exception the form has to translate.
 */
export async function scanFile(input: ScanInput): Promise<ScanReport> {
  const { file, sha256, knownHashes } = input;
  const flags: Flag[] = [];
  const facts: string[] = [];

  facts.push(file.type || "unknown type");

  if (sha256 && knownHashes?.has(sha256)) {
    flags.push({
      id: "duplicate",
      severity: "reject",
      title: "You have already contributed this exact file",
      detail:
        "The digest matches a dataset in your own list. The same bytes twice is one contribution, not two.",
    });
  }

  const isImage = file.type.startsWith("image/");
  const isMedia =
    file.type.startsWith("video/") || file.type.startsWith("audio/");
  const isText =
    file.type.startsWith("text/") ||
    /json|csv|xml|ndjson|jsonl/i.test(file.type) ||
    /\.(csv|tsv|json|jsonl|ndjson|txt|md|xml|html)$/i.test(file.name);

  if (isImage) {
    await scanImage(file, flags, facts);
  } else if (isMedia) {
    await scanMedia(file, flags, facts);
  } else if (isText) {
    await scanText(file, flags, facts);
  } else {
    // Archives and everything else: the header still gets read, because a
    // Content Credential or a generator string is worth catching whatever the
    // extension says.
    const meta = readMetadata(await readHeader(file));
    readProvenanceFlags(meta, flags, facts);
  }

  const status = flags.some((f) => f.severity === "reject")
    ? "rejected"
    : flags.some((f) => f.severity === "flag")
      ? "flagged"
      : "clean";

  return { status, flags, facts, version: SCAN_VERSION };
}

/** The ids worth storing: what made this dataset less than clean. */
export function storableFlags(report: ScanReport): string[] {
  return report.flags
    .filter((flag) => flag.severity !== "note")
    .map((flag) => flag.id);
}

async function scanImage(file: File, flags: Flag[], facts: string[]) {
  const meta = readMetadata(await readHeader(file));
  readProvenanceFlags(meta, flags, facts);

  const pixels = await readPixels(file);

  if (!pixels) {
    flags.push({
      id: "unreadable",
      severity: "reject",
      title: "This browser can't open that image",
      detail:
        "Nothing that cannot be decoded here should be sold as data. Export it as JPEG or PNG and try again.",
    });
    return;
  }

  const { width, height, palette, flatness, grey, contrast } = pixels;
  facts.push(`${width} × ${height}`);
  facts.push(
    meta.make || meta.model
      ? `${[meta.make, meta.model].filter(Boolean).join(" ")}`
      : "no camera metadata",
  );
  facts.push(`${palette.toLocaleString("en-US")} colours`);

  if (file.size < LIMITS.imageBytes || Math.min(width, height) < LIMITS.imageEdge) {
    flags.push({
      id: "tiny",
      severity: "reject",
      title: "Too small to be worth licensing",
      detail: `${width} × ${height} at ${Math.round(file.size / 1024)} KB. An icon, a thumbnail or a preview rather than the original.`,
    });
  }

  // A capture writes an exposure, an aperture, an ISO, a lens. Nothing that
  // came off a screen has them, which is what makes the rest of this safe to
  // run: no test below fires on a file that carries them.
  const captured = meta.hasCaptureTags || Boolean(meta.make || meta.model);

  const screenSized = width > 0 && isScreenSize(width, height);
  const namedAsShot = looksLikeScreenshotName(file.name);
  const looksDrawn =
    flatness >= LIMITS.screenFlatness &&
    palette <= LIMITS.screenPalette &&
    grey >= LIMITS.screenGrey;
  const nearlyEmpty =
    contrast < LIMITS.emptyContrast && palette <= LIMITS.emptyPalette;

  if (palette <= LIMITS.blankPalette || contrast < LIMITS.blankContrast) {
    flags.push({
      id: "blank",
      severity: "reject",
      title: "There is nothing in this image",
      detail: `${palette} distinct colours and almost no variation in brightness — a blank, a solid fill or a failed export.`,
    });
  } else if (!captured && nearlyEmpty) {
    flags.push({
      id: "low-information",
      severity: "flag",
      title: "Very little in this image",
      detail: `${palette} colours and almost no variation in brightness — a flat background, a scan or a graphic. Kept, and held back from the marketplace until someone looks at it.`,
    });
  } else if (!captured && (screenSized || namedAsShot || looksDrawn)) {
    const because = namedAsShot
      ? "the file name says so"
      : screenSized
        ? `${width} × ${height} is a display's resolution, not a sensor's`
        : `${Math.round(flatness * 100)}% of it is flat fill across ${palette} colours`;

    flags.push({
      id: "screenshot",
      severity: "reject",
      title: "This looks like a screenshot",
      detail: `No camera metadata, and ${because}. A picture of an interface is not data about you — upload the export behind it instead.`,
    });
  } else if (
    !captured &&
    flatness >= LIMITS.softFlatness &&
    palette <= LIMITS.softPalette
  ) {
    flags.push({
      id: "screen-like",
      severity: "flag",
      title: "Low detail for a photograph",
      detail: `${Math.round(flatness * 100)}% flat fill across ${palette} colours, with no capture metadata. Kept, but it won't be listed until someone looks at it.`,
    });
  } else if (!captured) {
    flags.push({
      id: "no-capture-metadata",
      severity: "note",
      title: "No camera metadata",
      detail:
        "Messaging apps and editors strip it, so this on its own says nothing. It just means the file cannot prove where it came from.",
    });
  }
}

async function scanMedia(file: File, flags: Flag[], facts: string[]) {
  const stats = await readMediaStats(file);
  if (!stats) {
    facts.push("duration unavailable in this browser");
    return;
  }

  facts.push(`${stats.seconds.toFixed(1)}s`);
  if (stats.width && stats.height) facts.push(`${stats.width} × ${stats.height}`);

  if (stats.seconds > 0 && stats.seconds < LIMITS.clipSeconds) {
    flags.push({
      id: "short-clip",
      severity: "reject",
      title: "Too short to be a recording",
      detail: `${stats.seconds.toFixed(1)} seconds. A clip this length carries nothing a buyer could train on.`,
    });
  }
}

async function scanText(file: File, flags: Flag[], facts: string[]) {
  const stats = await readTextStats(file);
  if (!stats) {
    flags.push({
      id: "unreadable",
      severity: "reject",
      title: "Couldn't read that file as text",
      detail: "Check the encoding and try again.",
    });
    return;
  }

  facts.push(`${stats.lines.toLocaleString("en-US")} lines`);
  if (stats.columns) facts.push(`${stats.columns} columns`);
  if (stats.records !== null) {
    facts.push(`${stats.records.toLocaleString("en-US")} records`);
  }

  const thin =
    stats.records !== null
      ? stats.records < LIMITS.jsonRecords
      : stats.columns !== null
        ? stats.lines < LIMITS.exportLines
        : stats.characters < LIMITS.textCharacters;

  if (thin) {
    flags.push({
      id: "empty-export",
      severity: "reject",
      title: "This export is empty",
      detail:
        stats.records !== null
          ? `${stats.records} records in the whole file.`
          : stats.columns !== null
            ? `${stats.lines} rows including the header.`
            : `${stats.characters} characters.`,
    });
  }
}

/** The part of the verdict that comes from what the file says about itself. */
function readProvenanceFlags(
  meta: ReturnType<typeof readMetadata>,
  flags: Flag[],
  facts: string[],
) {
  const provenance = readProvenance(meta);

  if (meta.software) facts.push(meta.software);

  if (provenance.declaredSynthetic) {
    flags.push({
      id: "declared-synthetic",
      severity: "reject",
      title: "This file says it was generated",
      detail:
        "It carries the standard field for declaring synthetic media. Datavar sells data about people, and a model's output is not that.",
    });
  }

  if (provenance.generator) {
    flags.push({
      id: "generator-metadata",
      severity: "reject",
      title: `Made with ${provenance.generator}`,
      detail:
        "The generator wrote its own name, or its prompt, into the file's metadata. Nothing here had to guess.",
    });
  }

  if (
    provenance.contentCredential &&
    !provenance.declaredSynthetic &&
    !provenance.generator
  ) {
    flags.push({
      id: "content-credential",
      severity: "flag",
      title: "Carries a Content Credential",
      detail:
        "A provenance manifest is attached, and a browser cannot verify what it claims. Kept, and held back from the marketplace until someone reads it.",
    });
  }
}

/** Plain-language labels for a verdict stored on a row. */
export const FLAG_LABELS: Record<FlagId, string> = {
  "declared-synthetic": "Declared as generated",
  "generator-metadata": "Generator in metadata",
  "content-credential": "Unverified content credential",
  screenshot: "Screenshot",
  "screen-like": "Low detail, no capture metadata",
  duplicate: "Duplicate of your own file",
  blank: "Blank",
  "low-information": "Mostly flat, little in it",
  tiny: "Too small",
  unreadable: "Unreadable",
  "empty-export": "Empty export",
  "short-clip": "Too short",
  "no-capture-metadata": "No camera metadata",
};

export function flagLabel(id: string): string {
  return FLAG_LABELS[id as FlagId] ?? id;
}
