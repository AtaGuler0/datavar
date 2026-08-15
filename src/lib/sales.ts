import { STROOPS_PER_XLM } from "./stellar/config";

/**
 * The demand side of the protocol, simulated. Nothing here is real yet: no
 * buyer has signed anything, no licence has been issued. What is real is the
 * payout — a credited sale is test XLM sitting in the payout contract, and a
 * claim moves it out on the contributor's own signature — so
 * this file is the only place that invents anything, and it says so loudly.
 */

/** Stand-in buyers. Placeholders until the buyer side of the product exists. */
export const SIMULATED_BUYERS = [
  "Northwind AI",
  "Meridian Labs",
  "Halcyon Research",
  "Aperture Systems",
  "Calder Institute",
  "Ridgeline AI",
  "Voss & Kemp",
  "Orinoco Robotics",
] as const;

/**
 * The price band a simulated sale draws from, in XLM. Admins set the real
 * number per dataset from the admin panel; this is what an unattended round
 * falls back to.
 */
export const PRICE_BAND = { min: 1, max: 10 } as const;

/** XLM (as typed by an admin, or drawn at random) → stroops. */
export function xlmToStroops(xlm: number): number {
  return Math.round(xlm * STROOPS_PER_XLM);
}

/** A price in the band, to the cent. */
export function randomPriceStroops(): number {
  const xlm = PRICE_BAND.min + Math.random() * (PRICE_BAND.max - PRICE_BAND.min);
  return xlmToStroops(Math.round(xlm * 100) / 100);
}

/** A buyer from the roster. */
export function randomBuyer(): string {
  return SIMULATED_BUYERS[Math.floor(Math.random() * SIMULATED_BUYERS.length)];
}

/**
 * Picks `count` distinct items at random. Fisher-Yates over a copy — a
 * sort-by-random shuffle is biased, and the round should be able to say it
 * picked fairly.
 */
export function sample<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, Math.min(count, pool.length)));
}
