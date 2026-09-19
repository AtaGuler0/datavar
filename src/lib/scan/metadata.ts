/**
 * Reading what a file says about itself.
 *
 * A generated image usually admits it, in a field nobody looks at: Stable
 * Diffusion writes its whole prompt into a PNG text chunk, ComfyUI writes the
 * workflow, Firefly and the phone-camera AI tools write a Content Credential,
 * and the IPTC standard has a field whose entire job is to say "this was made
 * by a trained algorithm". A screenshot admits it differently — by having none
 * of the tags a camera writes, at exactly the dimensions of a screen.
 *
 * So this is a small, dependency-free reader for the headers of the formats
 * this product actually receives. It parses the first slice of the file in the
 * contributor's own browser: no upload, no server, no library, and nothing
 * leaves the device if the answer is "don't accept this".
 *
 * What it cannot do is detect a generated image that says nothing. A model
 * output run through a metadata stripper is bytes like any other, and no
 * heuristic here pretends otherwise — which is why the interface it feeds says
 * "declared" rather than "detected".
 */

/** How much of the file to read. Headers live at the front; EXIF is capped at
 *  64 KB by the JPEG spec, and PNG text chunks sit before the image data. */
export const HEADER_BYTES = 512 * 1024;

export type FileMetadata = {
  /** image/jpeg, image/png … as far as the bytes themselves say. */
  kind: "jpeg" | "png" | "webp" | "gif" | "other";
  width: number | null;
  height: number | null;
  /** Camera maker and model, when the file carries them. */
  make: string | null;
  model: string | null;
  /** The tool that last wrote the file, as it named itself. */
  software: string | null;
  /** True when the file carries the tags only a capture writes. */
  hasCaptureTags: boolean;
  /** Every string worth searching: XMP, PNG text chunks, EXIF strings. */
  text: string;
  /** A C2PA / Content Credential manifest is attached. */
  hasContentCredential: boolean;
};

const decoder = new TextDecoder("utf-8", { fatal: false });

/** The header of a file, as bytes. */
export async function readHeader(file: File): Promise<Uint8Array> {
  const slice = file.slice(0, Math.min(file.size, HEADER_BYTES));
  return new Uint8Array(await slice.arrayBuffer());
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return decoder.decode(bytes.subarray(start, start + length)).replace(/\0+$/, "");
}

function startsWith(bytes: Uint8Array, offset: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** Everything the header says, whatever format it turns out to be. */
export function readMetadata(bytes: Uint8Array): FileMetadata {
  const meta: FileMetadata = {
    kind: "other",
    width: null,
    height: null,
    make: null,
    model: null,
    software: null,
    hasCaptureTags: false,
    text: "",
    hasContentCredential: false,
  };

  if (bytes.length < 12) return meta;

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    meta.kind = "jpeg";
    readJpeg(bytes, meta);
  } else if (startsWith(bytes, 1, "PNG")) {
    meta.kind = "png";
    readPng(bytes, meta);
  } else if (startsWith(bytes, 0, "RIFF") && startsWith(bytes, 8, "WEBP")) {
    meta.kind = "webp";
    readWebp(bytes, meta);
  } else if (startsWith(bytes, 0, "GIF8")) {
    meta.kind = "gif";
  }

  return meta;
}

/* -------------------------------------------------------------------------
 * JPEG
 *
 * A sequence of marker segments. The ones worth opening are APP1 (EXIF, and
 * separately XMP), APP11 (the JUMBF box a Content Credential lives in) and
 * APP13 (the IPTC block Photoshop writes), plus SOF0–SOF15 for the size.
 * ---------------------------------------------------------------------- */
function readJpeg(bytes: Uint8Array, meta: FileMetadata): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Start of scan: the entropy-coded image follows, and nothing after it is
    // a segment we can walk.
    if (marker === 0xda || marker === 0xd9) break;

    const length = view.getUint16(offset + 2, false);
    if (length < 2) break;
    const start = offset + 4;
    const end = Math.min(start + length - 2, bytes.length);

    // SOFn: frame header, and where the real dimensions are.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc &&
      end - start >= 5
    ) {
      meta.height = view.getUint16(start + 1, false);
      meta.width = view.getUint16(start + 3, false);
    }

    if (marker === 0xe1) {
      if (startsWith(bytes, start, "Exif\0\0")) {
        readTiff(bytes, start + 6, end, meta);
      } else if (startsWith(bytes, start, "http://ns.adobe.com/xap/1.0/")) {
        meta.text += `\n${ascii(bytes, start, end - start)}`;
      }
    } else if (marker === 0xeb || marker === 0xe2) {
      // APP11 carries JUMBF; APP2 sometimes carries the same manifest.
      const blob = ascii(bytes, start, Math.min(end - start, 4096));
      if (blob.includes("c2pa") || blob.includes("jumb")) {
        meta.hasContentCredential = true;
        meta.text += `\n${blob}`;
      }
    } else if (marker === 0xed || marker === 0xee) {
      meta.text += `\n${ascii(bytes, start, Math.min(end - start, 4096))}`;
    }

    offset = end;
  }
}

/* -------------------------------------------------------------------------
 * EXIF / TIFF
 *
 * Two IFDs matter. IFD0 holds who made the file — Make, Model, Software — and
 * the Exif sub-IFD holds what a capture recorded: an exposure time, an aperture,
 * an ISO, a lens. A generated image usually has neither.
 *
 * `DateTimeOriginal` is deliberately not in that list, and finding out why is
 * the reason this reader exists at all. An iOS screenshot carries an EXIF block:
 * DateTimeOriginal, a UserComment and the pixel dimensions, and nothing else.
 * Counting a timestamp as evidence of a camera would have waved through every
 * screenshot taken on an iPhone — which is most of them.
 * ---------------------------------------------------------------------- */
const TAG = {
  make: 0x010f,
  model: 0x0110,
  software: 0x0131,
  artist: 0x013b,
  exifIfd: 0x8769,
  exposureTime: 0x829a,
  fNumber: 0x829d,
  isoSpeed: 0x8827,
  lensModel: 0xa434,
} as const;

function readTiff(
  bytes: Uint8Array,
  base: number,
  end: number,
  meta: FileMetadata,
): void {
  if (base + 8 > end) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const order = ascii(bytes, base, 2);
  if (order !== "II" && order !== "MM") return;
  const little = order === "II";

  const ifd0 = view.getUint32(base + 4, little);
  const captureTags = readIfd(view, bytes, base, base + ifd0, end, little, meta);

  // The sub-IFD pointer is itself a tag in IFD0; follow it for the capture
  // tags, which is where a camera actually writes them.
  if (captureTags.exifIfd) {
    readIfd(view, bytes, base, base + captureTags.exifIfd, end, little, meta);
  }
}

function readIfd(
  view: DataView,
  bytes: Uint8Array,
  base: number,
  at: number,
  end: number,
  little: boolean,
  meta: FileMetadata,
): { exifIfd?: number } {
  const out: { exifIfd?: number } = {};
  if (at + 2 > end) return out;

  const count = view.getUint16(at, little);
  // A plausible ceiling: a real IFD has tens of entries, and a corrupt length
  // would otherwise walk this off the end of the header slice.
  if (count > 512) return out;

  for (let i = 0; i < count; i++) {
    const entry = at + 2 + i * 12;
    if (entry + 12 > end) break;

    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const length = view.getUint32(entry + 4, little);

    const text = () => {
      if (type !== 2 || length === 0 || length > 512) return null;
      const where =
        length <= 4 ? entry + 8 : base + view.getUint32(entry + 8, little);
      if (where + length > end) return null;
      return ascii(bytes, where, length).trim() || null;
    };

    switch (tag) {
      case TAG.make:
        meta.make = text();
        break;
      case TAG.model:
        meta.model = text();
        break;
      case TAG.software:
        meta.software = text();
        break;
      case TAG.artist: {
        const value = text();
        if (value) meta.text += `\n${value}`;
        break;
      }
      case TAG.exifIfd:
        out.exifIfd = view.getUint32(entry + 8, little);
        break;
      case TAG.exposureTime:
      case TAG.fNumber:
      case TAG.isoSpeed:
      case TAG.lensModel:
        // Any one of these is a thing only a lens and a sensor produce. A
        // timestamp is not: see the note above about iOS screenshots.
        meta.hasCaptureTags = true;
        break;
    }
  }

  return out;
}

/* -------------------------------------------------------------------------
 * PNG
 *
 * Chunks, each with a four-character type. IHDR has the size; tEXt, iTXt and
 * zTXt hold the strings that generators fill in — Stable Diffusion's whole
 * prompt arrives under the keyword `parameters`, ComfyUI's under `workflow`.
 * `caBX` is where a Content Credential goes.
 * ---------------------------------------------------------------------- */
function readPng(bytes: Uint8Array, meta: FileMetadata): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = ascii(bytes, offset + 4, 4);
    const start = offset + 8;
    const end = Math.min(start + length, bytes.length);

    if (type === "IHDR" && end - start >= 8) {
      meta.width = view.getUint32(start, false);
      meta.height = view.getUint32(start + 4, false);
    } else if (type === "tEXt" || type === "iTXt") {
      // Keyword, NUL, then the value. iTXt has compression and language
      // fields between them, which read as empty strings for our purposes.
      meta.text += `\n${ascii(bytes, start, Math.min(end - start, 8192))}`;
    } else if (type === "zTXt") {
      // Deflated; the keyword before the NUL is still readable and is often
      // the whole tell ("parameters" on a Stable Diffusion export).
      meta.text += `\n${ascii(bytes, start, Math.min(end - start, 80))}`;
    } else if (type === "eXIf") {
      readTiff(bytes, start, end, meta);
    } else if (type === "caBX") {
      meta.hasContentCredential = true;
    } else if (type === "IDAT" || type === "IEND") {
      break;
    }

    if (length > bytes.length) break;
    offset = end + 4; // + CRC
  }
}

/* -------------------------------------------------------------------------
 * WebP — a RIFF container; EXIF and XMP ride in their own chunks.
 * ---------------------------------------------------------------------- */
function readWebp(bytes: Uint8Array, meta: FileMetadata): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = Math.min(start + length, bytes.length);

    if (type === "VP8X" && end - start >= 10) {
      // 24-bit widths, minus one.
      meta.width = 1 + (bytes[start + 4] | (bytes[start + 5] << 8) | (bytes[start + 6] << 16));
      meta.height = 1 + (bytes[start + 7] | (bytes[start + 8] << 8) | (bytes[start + 9] << 16));
    } else if (type === "EXIF") {
      readTiff(bytes, start, end, meta);
    } else if (type === "XMP ") {
      meta.text += `\n${ascii(bytes, start, Math.min(end - start, 8192))}`;
    }

    if (length > bytes.length) break;
    offset = end + (length % 2); // chunks are padded to even lengths
  }
}

/* -------------------------------------------------------------------------
 * What the strings mean
 * ---------------------------------------------------------------------- */

/**
 * Tools that write their own name into a file they generated, each with the
 * name to show a person. Matched against every string the header yielded,
 * which is why the list can be blunt: these are words that appear in a Software
 * tag or a prompt block, not words that turn up in a holiday photo.
 */
const GENERATORS: ReadonlyArray<readonly [string, string]> = [
  ["stable diffusion", "Stable Diffusion"],
  ["stablediffusion", "Stable Diffusion"],
  ["sdxl", "Stable Diffusion"],
  ["automatic1111", "Automatic1111"],
  ["comfyui", "ComfyUI"],
  ["invokeai", "InvokeAI"],
  ["fooocus", "Fooocus"],
  ["midjourney", "Midjourney"],
  ["dall-e", "DALL·E"],
  ["dall·e", "DALL·E"],
  ["dalle", "DALL·E"],
  ["adobe firefly", "Adobe Firefly"],
  ["firefly", "Adobe Firefly"],
  ["novelai", "NovelAI"],
  ["leonardo.ai", "Leonardo"],
  ["playground ai", "Playground"],
  ["nightcafe", "NightCafe"],
  ["artbreeder", "Artbreeder"],
  ["ideogram", "Ideogram"],
  ["recraft", "Recraft"],
  ["flux.1", "FLUX"],
  ["black forest labs", "FLUX"],
  ["imagen", "Imagen"],
  ["runway", "Runway"],
  ["pika labs", "Pika"],
  ["generative fill", "a generative fill"],
  ["generative ai", "a generative tool"],
  ["ai generated", "a generative tool"],
  ["ai-generated", "a generative tool"],
  ["made with ai", "a generative tool"],
  // The parameter block a diffusion interface writes next to the image. No
  // tool named itself, but nothing else puts a sampler and a CFG scale in a
  // PNG text chunk.
  ["negative prompt", "an image generator (prompt metadata)"],
  ["cfg scale", "an image generator (prompt metadata)"],
  ["denoising strength", "an image generator (prompt metadata)"],
  ["sampler:", "an image generator (prompt metadata)"],
  ["txt2img", "an image generator (prompt metadata)"],
  ["img2img", "an image generator (prompt metadata)"],
];

/**
 * The IPTC field that exists precisely to answer this question, and the two
 * values that mean a model made it. When a file says this about itself there
 * is nothing to infer.
 */
const DECLARED_SYNTHETIC = [
  "trainedalgorithmicmedia",
  "compositewithtrainedalgorithmicmedia",
  "algorithmicmedia",
];

export type Provenance = {
  /** The file states it was generated, in a standard field. */
  declaredSynthetic: boolean;
  /** A generator named itself somewhere in the header, as a person would say
   *  it. */
  generator: string | null;
  /** A Content Credential is attached, whatever it says. */
  contentCredential: boolean;
};

export function readProvenance(meta: FileMetadata): Provenance {
  const haystack = `${meta.software ?? ""}\n${meta.text}`.toLowerCase();

  return {
    declaredSynthetic: DECLARED_SYNTHETIC.some((term) => haystack.includes(term)),
    generator:
      GENERATORS.find(([term]) => haystack.includes(term))?.[1] ?? null,
    contentCredential: meta.hasContentCredential,
  };
}
