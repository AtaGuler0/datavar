/**
 * How much is actually in a text export.
 *
 * The junk case here is not a generated image, it is an empty one: a CSV with a
 * header row and nothing under it, a JSON file holding `[]`, a takeout export
 * that failed and saved the error page. Each of those is a file of a plausible
 * size that contains no data, and each was worth a payout until something
 * counted the rows.
 *
 * Only the first slice is read. A file that is thin in its first 128 KB is thin,
 * and one that isn't has already passed.
 */

const SLICE_BYTES = 128 * 1024;

export type TextStats = {
  /** Non-empty lines in the slice. */
  lines: number;
  /** Columns on the first data row, when it parses as delimited text. */
  columns: number | null;
  characters: number;
  /** Records, when the whole file is JSON and parses. */
  records: number | null;
  /** The slice held the whole file. */
  complete: boolean;
};

export async function readTextStats(file: File): Promise<TextStats | null> {
  let text: string;
  try {
    const slice = file.slice(0, Math.min(file.size, SLICE_BYTES));
    text = new TextDecoder("utf-8", { fatal: false }).decode(
      await slice.arrayBuffer(),
    );
  } catch {
    return null;
  }

  const complete = file.size <= SLICE_BYTES;
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  let records: number | null = null;
  const trimmed = text.trimStart();
  if (complete && (trimmed.startsWith("[") || trimmed.startsWith("{"))) {
    try {
      const parsed = JSON.parse(text);
      records = Array.isArray(parsed)
        ? parsed.length
        : Object.keys(parsed as object).length;
    } catch {
      // Not JSON after all, or truncated. The line count still applies.
    }
  }

  // Delimiter sniffing, of the honest sort: whichever of the three appears most
  // on the first line, and only when it appears at all.
  let columns: number | null = null;
  const first = lines[0];
  if (first) {
    const counts = [",", ";", "\t"].map(
      (d) => [d, first.split(d).length - 1] as const,
    );
    const [delimiter, occurrences] = counts.sort((a, b) => b[1] - a[1])[0];
    if (occurrences > 0) columns = first.split(delimiter).length;
  }

  return {
    lines: lines.length,
    columns,
    characters: text.trim().length,
    records,
    complete,
  };
}
