import type { ConsentReceipt } from "./stellar/consent";
import type { Dataset } from "./supabase/datasets";
import type { Sale } from "./supabase/sales";

/**
 * One dataset's whole life, assembled from the three places it is recorded.
 *
 * The product had these as three separate screens — the file in one, the
 * consent receipt in another, the payout in a third — and nothing in the
 * interface said they were the same thing. They are: a dataset is hashed, then
 * consented to, then licensed, then paid for. This module is where those three
 * sources become one row.
 *
 * Two joins do it, and both are worth naming because they are the protocol's
 * own seams:
 *
 * - **Consent joins on the hash.** A receipt commits to the SHA-256 computed in
 *   the browser at upload time, not to a row id. That is deliberate: the
 *   contract has never heard of our database, so the only thing the two can
 *   agree on is the bytes themselves.
 * - **Sales join on the row id**, because a sale is our record, not the
 *   ledger's.
 *
 * Pure, and takes everything as arguments — no fetching, no clock. What is
 * "active" was decided by the contract's own timestamps when the receipts were
 * read, and re-deciding it here against a different clock would be a way to
 * disagree with the ledger.
 */

/** The four milestones the progress strip draws, in order. */
export const STAGES = ["hashed", "consented", "licensed", "paid"] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Which milestones this dataset has *ever* reached. Consent that was later
 * revoked still counts as reached: the strip is a history, and pretending a
 * withdrawn grant never happened would be the same edit the contract refuses
 * to make. Whether consent stands *now* is `activeReceipts`.
 */
export type Reached = Record<Stage, boolean>;

/** The one thing worth doing next, or nothing because it's someone else's move. */
export type NextAction = "grant" | "claim" | null;

export type DatasetLifecycle = {
  dataset: Dataset;
  /** Every receipt committing to this dataset's hash, newest first. */
  receipts: ConsentReceipt[];
  /** Those a buyer could act on right now. */
  activeReceipts: ConsentReceipt[];
  /** Every sale of this dataset, newest first. */
  sales: Sale[];
  claimedSales: Sale[];
  unclaimedSales: Sale[];
  reached: Reached;
  /** Everything this dataset has sold for, in stroops. */
  grossStroops: number;
  /** Of that, what is still waiting to be claimed. */
  claimableStroops: number;
  next: NextAction;
};

const sum = (sales: Sale[]) =>
  sales.reduce((total, sale) => total + Number(sale.price_stroops), 0);

/** Hex from two different systems; compare it in one case. */
const key = (hash: string) => hash.trim().toLowerCase();

/**
 * Joins datasets to their receipts and sales. Datasets keep the order they
 * arrive in — newest first, as every list in the product returns them.
 */
export function buildLifecycles(
  datasets: Dataset[],
  receipts: ConsentReceipt[],
  sales: Sale[],
): DatasetLifecycle[] {
  // Index once rather than filtering the full lists per dataset: a contributor
  // with 200 datasets and 200 receipts would otherwise be doing 40,000
  // comparisons to draw one page.
  const receiptsByHash = new Map<string, ConsentReceipt[]>();
  for (const receipt of receipts) {
    const at = key(receipt.datasetHash);
    const list = receiptsByHash.get(at);
    if (list) list.push(receipt);
    else receiptsByHash.set(at, [receipt]);
  }

  const salesByDataset = new Map<string, Sale[]>();
  for (const sale of sales) {
    const list = salesByDataset.get(sale.dataset_id);
    if (list) list.push(sale);
    else salesByDataset.set(sale.dataset_id, [sale]);
  }

  return datasets.map((dataset) => {
    const datasetReceipts = receiptsByHash.get(key(dataset.sha256)) ?? [];
    const datasetSales = salesByDataset.get(dataset.id) ?? [];

    const activeReceipts = datasetReceipts.filter((r) => r.status === "active");
    const claimedSales = datasetSales.filter((s) => s.status === "claimed");
    const unclaimedSales = datasetSales.filter((s) => s.status !== "claimed");

    return {
      dataset,
      receipts: datasetReceipts,
      activeReceipts,
      sales: datasetSales,
      claimedSales,
      unclaimedSales,
      reached: {
        // The file exists and has a digest, or it wouldn't be here at all.
        hashed: true,
        consented: datasetReceipts.length > 0,
        licensed: datasetSales.length > 0,
        paid: claimedSales.length > 0,
      },
      grossStroops: sum(datasetSales),
      claimableStroops: sum(unclaimedSales),
      next: nextAction(activeReceipts.length, unclaimedSales.length),
    };
  });
}

/**
 * Money first: an unclaimed payout is the contributor's own, and asking them to
 * renew consent while their earnings sit unclaimed would be the wrong order.
 * After that, the gap that stops anything from happening — no standing consent
 * means no buyer can license it. Otherwise the next move is a buyer's, not
 * theirs, and the row offers nothing rather than inventing busywork.
 */
function nextAction(activeCount: number, unclaimedCount: number): NextAction {
  if (unclaimedCount > 0) return "claim";
  if (activeCount === 0) return "grant";
  return null;
}

/** The figures a page header quotes, derived from the same rows it lists. */
export function lifecycleTotals(items: DatasetLifecycle[]) {
  return {
    datasets: items.length,
    /** Nothing a buyer can act on — the queue that actually blocks earnings. */
    awaitingConsent: items.filter((i) => i.activeReceipts.length === 0).length,
    withStandingConsent: items.filter((i) => i.activeReceipts.length > 0).length,
    licensed: items.filter((i) => i.reached.licensed).length,
    grossStroops: items.reduce((total, i) => total + i.grossStroops, 0),
    claimableStroops: items.reduce((total, i) => total + i.claimableStroops, 0),
    bytes: items.reduce((total, i) => total + i.dataset.byte_size, 0),
  };
}
