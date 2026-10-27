#!/usr/bin/env node
/**
 * Datavar's protocol metrics, computed from contract events only.
 *
 * No database row goes into any number here. The events come from the
 * Stellar Expert API, which indexes every Soroban event since each contract
 * was deployed. Public RPC nodes only keep about a week of events, so they
 * can't answer for a longer window. Anyone can run this against the same
 * contract ids and should get the same output; if they don't, the bug is ours.
 *
 * What each one means:
 *
 *   M1  gross licence value       sum of Licensed.paid
 *   M2  protocol revenue          sum of the fee in Settled and Refunded
 *   M3  contributor payouts       sum of Credited.amount, and of Claimed.amount
 *   M4  dataset value licensed    Licensed.paid grouped by the receipt's dataset
 *   M5  net contributor retention cohort credit this month / last month
 *   M6  revocation rate           Revoked / Granted, and median time to revoke
 *   M7  weekly active contributors distinct wallets with a Granted, per week
 *
 * Wallets in metrics/excluded-wallets.txt (the team's and our load-test bot's)
 * are dropped from every metric.
 *
 * Usage:
 *   node metrics/compute.mjs                       # whole history, markdown
 *   node metrics/compute.mjs --from=2026-09-01 --to=2026-12-01
 *   node metrics/compute.mjs --json
 *   node metrics/compute.mjs --no-exclude          # include our own wallets
 *
 * Contract ids default to the testnet deployment and can be overridden with
 * --consent=, --payout=, --payout-usdc=, --licence=, --licence-usdc=, or the
 * NEXT_PUBLIC_* variables of the same names.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scValToNative, xdr } from "@stellar/stellar-sdk";

const here = dirname(fileURLToPath(import.meta.url));
const STROOPS = 10_000_000;
const DAY = 86_400;

// ---------------------------------------------------------------------------
// Arguments

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(here, "..", ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    // No .env.local is fine: the defaults below are the public deployment.
  }
}
loadEnvLocal();

const pick = (flag, env, fallback = "") =>
  (typeof args[flag] === "string" ? args[flag] : process.env[env]) || fallback;

const CONTRACTS = {
  consent: pick(
    "consent",
    "NEXT_PUBLIC_CONSENT_CONTRACT_ID",
    "CBBSNMX74QCDBYJ3MECQTVBAQQ52NYJWLI5B7JUEESHHSPAGAJAJTLQI",
  ),
  vaults: {
    XLM: pick(
      "payout",
      "NEXT_PUBLIC_PAYOUT_CONTRACT_ID",
      "CCHFCOYRZF2UZPLG5Y2YYHFAFNTWALQEV7R3SBWCPE6FKX2USXOYQPOL",
    ),
    USDC: pick("payout-usdc", "NEXT_PUBLIC_PAYOUT_USDC_CONTRACT_ID"),
  },
  licences: {
    XLM: pick("licence", "NEXT_PUBLIC_LICENCE_CONTRACT_ID"),
    USDC: pick("licence-usdc", "NEXT_PUBLIC_LICENCE_USDC_CONTRACT_ID"),
  },
};

const NETWORK = typeof args.network === "string" ? args.network : "testnet";
const FROM = typeof args.from === "string" ? Date.parse(args.from) / 1000 : 0;
const TO =
  typeof args.to === "string" ? Date.parse(args.to) / 1000 : Math.floor(Date.now() / 1000);

function loadExclusions() {
  if (args["no-exclude"]) return new Set();
  const file =
    typeof args.exclude === "string"
      ? resolve(args.exclude)
      : resolve(here, "excluded-wallets.txt");
  try {
    return new Set(
      readFileSync(file, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#")),
    );
  } catch {
    return new Set();
  }
}
const EXCLUDED = loadExclusions();

// ---------------------------------------------------------------------------
// Events

const API = `https://api.stellar.expert/explorer/${NETWORK}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every event a contract has emitted, oldest first, decoded. */
async function eventsOf(contractId) {
  if (!contractId) return [];
  const out = [];
  let url = `${API}/contract/${contractId}/events?order=asc&limit=200`;
  for (let page = 0; page < 500; page++) {
    let res;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch(url);
      if (res.status !== 429) break;
      await sleep(1_000 * (attempt + 1));
    }
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const body = await res.json();
    const records = body?._embedded?.records ?? [];
    if (records.length === 0) break;
    for (const r of records) {
      out.push({
        name: r.topics[0],
        topics: r.topics.slice(1),
        ts: Number(r.ts),
        id: r.id,
        body: scValToNative(xdr.ScVal.fromXDR(r.bodyXdr, "base64")),
      });
    }
    const next = body?._links?.next?.href;
    if (!next) break;
    url = `https://api.stellar.expert${next}`;
    await sleep(200);
  }
  return out;
}

const num = (v) => Number(v ?? 0);
const inWindow = (e) => e.ts >= FROM && e.ts < TO;
const isExcluded = (...addresses) => addresses.some((a) => a && EXCLUDED.has(a));
const month = (ts) => new Date(ts * 1000).toISOString().slice(0, 7);
function isoWeek(ts) {
  const d = new Date(ts * 1000);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - first) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function median(xs) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------------------------------------------------------------------------
// Compute

async function main() {
  const consent = await eventsOf(CONTRACTS.consent);
  const vaults = {};
  const licences = {};
  for (const asset of ["XLM", "USDC"]) {
    vaults[asset] = await eventsOf(CONTRACTS.vaults[asset]);
    licences[asset] = await eventsOf(CONTRACTS.licences[asset]);
  }

  // Receipts, from Granted and Revoked over all time: a licence in the window
  // can stand on a receipt granted before it.
  const receipts = new Map();
  for (const e of consent) {
    if (e.name === "granted") {
      receipts.set(num(e.body.id), {
        contributor: e.topics[0],
        hash: Buffer.from(e.body.dataset_hash).toString("hex"),
        grantedAt: e.ts,
        expiresAt: num(e.body.expires_at),
        revokedAt: null,
      });
    } else if (e.name === "revoked") {
      const r = receipts.get(num(e.body.id));
      if (r) r.revokedAt = num(e.body.revoked_at);
    }
  }

  const granted = consent.filter(
    (e) => e.name === "granted" && inWindow(e) && !isExcluded(e.topics[0]),
  );
  const revoked = consent.filter(
    (e) => e.name === "revoked" && inWindow(e) && !isExcluded(e.topics[0]),
  );

  const perAsset = {};
  for (const asset of ["XLM", "USDC"]) {
    const v = vaults[asset];
    const l = licences[asset];
    const credited = v.filter(
      (e) => e.name === "credited" && inWindow(e) && !isExcluded(e.topics[0]),
    );
    const claimed = v.filter(
      (e) => e.name === "claimed" && inWindow(e) && !isExcluded(e.topics[0]),
    );
    const licensed = l.filter(
      (e) => e.name === "licensed" && inWindow(e) && !isExcluded(e.topics[0], e.topics[1]),
    );
    const closed = l.filter(
      (e) => (e.name === "settled" || e.name === "refunded") && inWindow(e),
    );
    const refunds = l.filter((e) => e.name === "refunded" && inWindow(e));

    // M4: value per dataset hash.
    const byDataset = new Map();
    for (const e of licensed) {
      const r = receipts.get(num(e.body.receipt_id));
      const key = r?.hash ?? `receipt:${num(e.body.receipt_id)}`;
      byDataset.set(key, (byDataset.get(key) ?? 0) + num(e.body.paid));
    }

    const buyers = new Map();
    for (const e of licensed) {
      if (!buyers.has(e.topics[0])) buyers.set(e.topics[0], e.ts);
    }

    perAsset[asset] = {
      contracts: { vault: CONTRACTS.vaults[asset] || null, licence: CONTRACTS.licences[asset] || null },
      m1GrossLicenceValue: licensed.reduce((s, e) => s + num(e.body.paid), 0),
      licences: licensed.length,
      m2ProtocolRevenue: closed.reduce((s, e) => s + num(e.body.fee), 0),
      refunded: refunds.reduce((s, e) => s + num(e.body.refunded), 0),
      m3Credited: credited.reduce((s, e) => s + num(e.body.amount), 0),
      m3Claimed: claimed.reduce((s, e) => s + num(e.body.amount), 0),
      vaultInflows: v
        .filter((e) => e.name === "funded" && inWindow(e) && !isExcluded(e.topics[0]))
        .reduce((s, e) => s + num(e.body.amount), 0),
      m4DatasetsLicensed: byDataset.size,
      m4ValuePerDataset: byDataset.size
        ? [...byDataset.values()].reduce((a, b) => a + b, 0) / byDataset.size
        : 0,
      payingBuyers: [...buyers.entries()].map(([buyer, ts]) => ({
        buyer,
        firstPurchase: new Date(ts * 1000).toISOString(),
      })),
      licensedHashes: new Set(byDataset.keys()),
    };
  }

  // M4 licensed ratio, across assets: hashes with a live receipt at the end
  // of the window that were licensed at least once.
  const live = new Set();
  for (const r of receipts.values()) {
    if (isExcluded(r.contributor)) continue;
    if (r.grantedAt < TO && r.expiresAt > TO && (!r.revokedAt || r.revokedAt > TO)) {
      live.add(r.hash);
    }
  }
  const licensedAny = new Set([
    ...perAsset.XLM.licensedHashes,
    ...perAsset.USDC.licensedHashes,
  ]);
  const licensedLive = [...live].filter((h) => licensedAny.has(h)).length;

  // M5: cohorts by the month of each contributor's first grant (all time).
  const firstGrant = new Map();
  for (const e of consent) {
    if (e.name !== "granted" || isExcluded(e.topics[0])) continue;
    if (!firstGrant.has(e.topics[0])) firstGrant.set(e.topics[0], e.ts);
  }
  const cohorts = new Map();
  for (const [wallet, ts] of firstGrant) {
    const c = month(ts);
    if (!cohorts.has(c)) cohorts.set(c, new Set());
    cohorts.get(c).add(wallet);
  }
  const creditByWalletMonth = new Map();
  const activeByMonth = new Map();
  const touch = (m, w) => {
    if (!activeByMonth.has(m)) activeByMonth.set(m, new Set());
    activeByMonth.get(m).add(w);
  };
  for (const asset of ["XLM", "USDC"]) {
    for (const e of vaults[asset]) {
      if (isExcluded(e.topics[0])) continue;
      if (e.name === "credited") {
        // Each vault's units, kept apart: USDC is converted at nothing.
        const k = `${e.topics[0]}|${month(e.ts)}|${asset}`;
        creditByWalletMonth.set(k, (creditByWalletMonth.get(k) ?? 0) + num(e.body.amount));
      }
      if (e.name === "claimed") touch(month(e.ts), e.topics[0]);
    }
  }
  for (const e of consent) {
    if (e.name === "granted" && !isExcluded(e.topics[0])) touch(month(e.ts), e.topics[0]);
  }
  const months = [...new Set([...activeByMonth.keys(), ...cohorts.keys()])]
    .filter((m) => m >= month(Math.max(FROM, 0)) && m <= month(TO - 1))
    .sort();
  const retention = [];
  for (const [cohort, members] of [...cohorts.entries()].sort()) {
    for (let i = 1; i < months.length; i++) {
      const n = months[i];
      const prev = months[i - 1];
      if (prev < cohort) continue;
      const sum = (m) => {
        let s = 0;
        for (const w of members) s += creditByWalletMonth.get(`${w}|${m}|XLM`) ?? 0;
        return s;
      };
      const before = sum(prev);
      const now = sum(n);
      const active = [...members].filter((w) => activeByMonth.get(n)?.has(w)).length;
      retention.push({
        cohort,
        size: members.size,
        period: n,
        ncrXlm: before > 0 ? now / before : null,
        activeRetention: active / members.size,
      });
    }
  }

  // M6.
  const revokeDelays = [];
  for (const e of revoked) {
    const r = receipts.get(num(e.body.id));
    if (r) revokeDelays.push(num(e.body.revoked_at) - r.grantedAt);
  }

  // M7.
  const weekly = new Map();
  for (const e of granted) {
    const w = isoWeek(e.ts);
    if (!weekly.has(w)) weekly.set(w, new Set());
    weekly.get(w).add(e.topics[0]);
  }

  for (const asset of ["XLM", "USDC"]) delete perAsset[asset].licensedHashes;

  return {
    network: NETWORK,
    window: {
      from: FROM ? new Date(FROM * 1000).toISOString() : "deployment",
      to: new Date(TO * 1000).toISOString(),
    },
    excludedWallets: EXCLUDED.size,
    consentContract: CONTRACTS.consent,
    perAsset,
    m4LicensedRatio: {
      liveDatasets: live.size,
      licensedLive,
      ratio: live.size ? licensedLive / live.size : null,
    },
    m5Retention: retention,
    m6Revocation: {
      granted: granted.length,
      revoked: revoked.length,
      rate: granted.length ? revoked.length / granted.length : null,
      medianDaysToRevoke:
        median(revokeDelays) === null ? null : median(revokeDelays) / DAY,
    },
    m7WeeklyActiveContributors: [...weekly.entries()]
      .sort()
      .map(([week, set]) => ({ week, contributors: set.size })),
  };
}

// ---------------------------------------------------------------------------
// Output

const units = (stroops) =>
  (stroops / STROOPS).toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (x) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

function markdown(m) {
  const lines = [];
  lines.push(`# Datavar metrics (${m.network})`);
  lines.push("");
  lines.push(`Window: ${m.window.from} to ${m.window.to}. ${m.excludedWallets} of our own wallets excluded.`);
  lines.push("");
  lines.push("| Metric | XLM | USDC |");
  lines.push("|---|---|---|");
  const row = (label, f) =>
    lines.push(`| ${label} | ${f(m.perAsset.XLM)} | ${f(m.perAsset.USDC)} |`);
  row("M1 Gross licence value", (a) => (a.contracts.licence ? units(a.m1GrossLicenceValue) : "no licence contract"));
  row("Licences sold", (a) => String(a.licences));
  row("M2 Protocol revenue settled", (a) => units(a.m2ProtocolRevenue));
  row("Refunded to buyers", (a) => units(a.refunded));
  row("M3 Credited to contributors", (a) => units(a.m3Credited));
  row("M3 Claimed by contributors", (a) => units(a.m3Claimed));
  row("Vault inflows (fund calls)", (a) => units(a.vaultInflows));
  row("M4 Datasets licensed", (a) => String(a.m4DatasetsLicensed));
  row("M4 Value per licensed dataset", (a) => units(a.m4ValuePerDataset));
  row("Paying buyers", (a) => String(a.payingBuyers.length));
  lines.push("");
  lines.push(
    `M4 licensed ratio: ${m.m4LicensedRatio.licensedLive} of ${m.m4LicensedRatio.liveDatasets} datasets with a live receipt were licensed at least once (${pct(m.m4LicensedRatio.ratio)}).`,
  );
  lines.push("");
  lines.push(
    `M6 revocation: ${m.m6Revocation.revoked} revoked of ${m.m6Revocation.granted} granted (${pct(m.m6Revocation.rate)}), median ${m.m6Revocation.medianDaysToRevoke === null ? "n/a" : m.m6Revocation.medianDaysToRevoke.toFixed(1) + " days"} from grant to revoke.`,
  );
  lines.push("");
  lines.push("## M5 Net contributor retention (XLM credits)");
  lines.push("");
  if (m.m5Retention.length === 0) {
    lines.push("Not enough months in the window yet.");
  } else {
    lines.push("| Cohort | Size | Period | NCR | Active retention |");
    lines.push("|---|---|---|---|---|");
    for (const r of m.m5Retention) {
      lines.push(`| ${r.cohort} | ${r.size} | ${r.period} | ${pct(r.ncrXlm)} | ${pct(r.activeRetention)} |`);
    }
  }
  lines.push("");
  lines.push("## M7 Weekly active contributors");
  lines.push("");
  if (m.m7WeeklyActiveContributors.length === 0) {
    lines.push("No grants in the window.");
  } else {
    lines.push("| Week | Contributors granting |");
    lines.push("|---|---|");
    for (const w of m.m7WeeklyActiveContributors) lines.push(`| ${w.week} | ${w.contributors} |`);
  }
  for (const asset of ["XLM", "USDC"]) {
    const buyers = m.perAsset[asset].payingBuyers;
    if (buyers.length === 0) continue;
    lines.push("");
    lines.push(`## Paying buyers (${asset})`);
    lines.push("");
    for (const b of buyers) lines.push(`- ${b.buyer}, first purchase ${b.firstPurchase}`);
  }
  return lines.join("\n");
}

main()
  .then((m) => {
    console.log(args.json ? JSON.stringify(m, null, 2) : markdown(m));
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
