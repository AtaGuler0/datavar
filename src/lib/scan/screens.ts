/**
 * The sizes a screen is, and a file name that gives the game away.
 *
 * A photograph's dimensions come from a sensor: 4032×3024, 8064×6048, 6000×4000.
 * A screenshot's come from a display, and displays are sold in a short list of
 * sizes. Matching that list is not proof on its own — an export can be cropped
 * to anything — which is why the scanner only treats it as one signal, and only
 * for a file that carries no capture metadata at all.
 */

/**
 * Phone, tablet and desktop resolutions in wide use, at their native pixel
 * counts. Orientation is checked both ways, so each entry covers two.
 *
 * Kept deliberately short. A longer list catches a few more screenshots and
 * starts catching photographs cropped to 16:9, and the trade is not worth it:
 * the metadata test already carries most of the weight.
 */
const SCREENS: ReadonlyArray<readonly [number, number]> = [
  // iPhone
  [1170, 2532], [1179, 2556], [1290, 2796], [1206, 2622], [1320, 2868],
  [1125, 2436], [1242, 2688], [828, 1792], [750, 1334], [640, 1136],
  // iPad
  [1620, 2160], [1640, 2360], [1668, 2388], [2048, 2732], [1536, 2048],
  // Android, common panels
  [1080, 1920], [1080, 2340], [1080, 2400], [1440, 3120], [1440, 2960],
  [1220, 2712], [1344, 2992],
  // Desktop and laptop
  [1280, 720], [1280, 800], [1366, 768], [1440, 900], [1600, 900],
  [1680, 1050], [1920, 1080], [1920, 1200], [2048, 1152], [2240, 1400],
  [2304, 1440], [2560, 1440], [2560, 1600], [2880, 1800], [3024, 1964],
  [3456, 2234], [3440, 1440], [3840, 2160], [5120, 2880],
];

/** Whether these dimensions are a display's, either way up. */
export function isScreenSize(width: number, height: number): boolean {
  return SCREENS.some(
    ([w, h]) => (width === w && height === h) || (width === h && height === w),
  );
}

/**
 * What every platform calls the file when you press the screenshot key, in the
 * languages this product is likely to meet. A name is weak evidence about
 * content — it is also the thing the person who took it will recognise
 * immediately when the scanner explains itself.
 */
const SCREENSHOT_NAMES =
  /(screen[ _-]?shot|screen[ _-]?capture|cleanshot|ekran[ _-]?(görüntüsü|goruntusu|resmi)|bildschirmfoto|capture[ _-]d.?écran|captura[ _-]de[ _-]pantalla|снимок[ _-]экрана|스크린샷|スクリーンショット|截屏|screencap)/i;

export function looksLikeScreenshotName(filename: string): boolean {
  return SCREENSHOT_NAMES.test(filename);
}
