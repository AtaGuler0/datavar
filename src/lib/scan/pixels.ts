/**
 * What the picture itself looks like, in four numbers.
 *
 * A photograph is noise with structure in it: no two neighbouring pixels are
 * exactly equal, the palette runs to tens of thousands of shades, and the
 * brightness varies across the frame. A screenshot is the opposite by
 * construction — flat fills, a handful of interface colours, hard straight
 * edges — and a blank or broken file has almost nothing in it at all.
 *
 * So rather than try to recognise what an image is *of*, this measures how much
 * is in it. Cheap, explainable, and wrong in a direction a person can argue
 * with: every number here is shown to the contributor beside the verdict.
 *
 * Runs on a 192-pixel thumbnail with smoothing off. Off matters: an interpolated
 * downscale invents intermediate colours along every edge, which is exactly the
 * texture this is measuring the absence of.
 */

const THUMBNAIL = 192;

export type PixelStats = {
  width: number;
  height: number;
  /** Distinct colours after quantising to 5 bits per channel. */
  palette: number;
  /** Share of pixels identical to the one on their right. */
  flatness: number;
  /** Share of pixels that are grey or near-grey — interface chrome is. */
  grey: number;
  /** Standard deviation of luminance, 0–255. */
  contrast: number;
};

/**
 * Decodes the image and measures it, or null when the browser cannot decode it
 * at all — which is its own answer, handled by the caller.
 */
export async function readPixels(file: File): Promise<PixelStats | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  try {
    const { width, height } = bitmap;
    if (!width || !height) return null;

    const scale = Math.min(1, THUMBNAIL / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const { data } = ctx.getImageData(0, 0, w, h);
    const colours = new Set<number>();

    let flat = 0;
    let pairs = 0;
    let grey = 0;
    let sum = 0;
    let sumSquares = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max - min <= 8) grey++;

        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += luma;
        sumSquares += luma * luma;

        if (x + 1 < w) {
          pairs++;
          const j = i + 4;
          if (r === data[j] && g === data[j + 1] && b === data[j + 2]) flat++;
        }
      }
    }

    const pixels = w * h;
    const mean = sum / pixels;

    return {
      width,
      height,
      palette: colours.size,
      flatness: pairs === 0 ? 0 : flat / pairs,
      grey: grey / pixels,
      contrast: Math.sqrt(Math.max(0, sumSquares / pixels - mean * mean)),
    };
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}
