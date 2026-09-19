/**
 * How long a clip is, asked of the browser that would have to play it.
 *
 * Dashcam and voice are two of the nine source types, and the junk case for
 * both is length: a two-second clip, a silent recording, a video file that is
 * really a still. The browser already has a decoder for everything it accepts,
 * and loading only the metadata costs a header read rather than a decode.
 *
 * Deliberately gives up quickly. A format the browser cannot open is not a
 * verdict — plenty of legitimate recordings are in containers it declines — so
 * a timeout returns null and the caller judges the file on its other numbers.
 */

const TIMEOUT_MS = 4_000;

export type MediaStats = {
  seconds: number;
  width: number | null;
  height: number | null;
};

export function readMediaStats(file: File): Promise<MediaStats | null> {
  const video = file.type.startsWith("video/");
  if (!video && !file.type.startsWith("audio/")) return Promise.resolve(null);

  return new Promise((resolve) => {
    const element = document.createElement(video ? "video" : "audio");
    const url = URL.createObjectURL(file);
    let settled = false;

    const done = (stats: MediaStats | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
      resolve(stats);
    };

    const timer = setTimeout(() => done(null), TIMEOUT_MS);

    element.preload = "metadata";
    element.muted = true;
    element.onloadedmetadata = () => {
      const seconds = Number.isFinite(element.duration) ? element.duration : 0;
      done({
        seconds,
        width: video ? (element as HTMLVideoElement).videoWidth || null : null,
        height: video ? (element as HTMLVideoElement).videoHeight || null : null,
      });
    };
    element.onerror = () => done(null);
    element.src = url;
  });
}
