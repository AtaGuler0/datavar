import { nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { isLicenceConfigured, licenceFor, type PayAsset } from "./config";
import { saleReference } from "./payout";
import {
  buildInvocation,
  simulate,
  SorobanError,
  submitSigned,
  addressArg,
  type ErrorTable,
} from "./soroban";

/**
 * The licence contract, from the server's side.
 *
 * Same posture as the vault module: it builds transactions for a wallet to sign
 * and relays them, and holds no key. A buyer signs `purchase`, and anyone (in
 * practice an operator from the admin panel) signs `settle_many` to close
 * licences whose hold is over or whose receipt was revoked.
 *
 * Each licence carries the sale's reference, `sha256(sale id)`, and passes it
 * to the vault when it settles. So `isCredited` in payout.ts answers for a
 * licence sale the same way it does for an operator-credited one.
 */

/** Mirrors the `Error` enum in contracts/contracts/licence/src/lib.rs. */
const ERRORS: ErrorTable = {
  1: "That isn't a valid price.",
  2: "The basket is empty.",
  3: "Too many datasets in one transaction.",
  4: "One of those datasets is no longer consented. Refresh the catalogue and try again.",
  5: "That sale was already paid for.",
  6: "The licence contract has no licence with that id.",
  7: "That licence is already closed.",
  8: "That licence is still inside its hold period.",
  9: "That fee is above the contract's ceiling.",
  10: "That hold is above the contract's ceiling.",
};

export { isLicenceConfigured };

function contractId(asset: PayAsset): string {
  if (!isLicenceConfigured(asset)) {
    throw new SorobanError(
      asset === "USDC"
        ? "The USDC licence contract isn't configured. Set NEXT_PUBLIC_LICENCE_USDC_CONTRACT_ID."
        : "The licence contract isn't configured. Set NEXT_PUBLIC_LICENCE_CONTRACT_ID.",
    );
  }
  return licenceFor(asset);
}

/** One dataset in a purchase, as the server prices it. */
export type PurchaseItem = {
  receiptId: number;
  stroops: number;
  /** Our sale id. Its SHA-256 is the reference the contract stores. */
  saleId: string;
};

/** The deployed terms, which the purchase screen states before payment. */
export type LicenceTerms = {
  feeBps: number;
  holdSecs: number;
  treasury: string;
};

export type LicenceState = "Held" | "Settled" | "Refunded";

export type Licence = {
  id: number;
  buyer: string;
  contributor: string;
  receiptId: number;
  paid: number;
  fee: number;
  purchasedAt: number;
  dueAt: number;
  expiresAt: number;
  state: LicenceState;
  credited: number;
  refunded: number;
};

/**
 * An `Item` struct as the contract reads it: a map keyed by field name, keys
 * in alphabetical order.
 */
function itemArg(item: PurchaseItem): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: nativeToScVal("price", { type: "symbol" }),
      val: nativeToScVal(BigInt(item.stroops), { type: "i128" }),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("receipt_id", { type: "symbol" }),
      val: nativeToScVal(BigInt(item.receiptId), { type: "u64" }),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("reference", { type: "symbol" }),
      val: nativeToScVal(Buffer.from(saleReference(item.saleId), "hex")),
    }),
  ]);
}

/** A unit enum variant comes back from `scValToNative` as `["Held"]`. */
function stateOf(value: unknown): LicenceState {
  const name = Array.isArray(value) ? value[0] : value;
  if (name === "Held" || name === "Settled" || name === "Refunded") return name;
  throw new SorobanError("The licence contract returned an unknown state.");
}

function toLicence(raw: Record<string, unknown>): Licence {
  const n = (v: unknown) => Number(v as bigint);
  return {
    id: n(raw.id),
    buyer: String(raw.buyer),
    contributor: String(raw.contributor),
    receiptId: n(raw.receipt_id),
    paid: n(raw.paid),
    fee: n(raw.fee),
    purchasedAt: n(raw.purchased_at),
    dueAt: n(raw.due_at),
    expiresAt: n(raw.expires_at),
    state: stateOf(raw.state),
    credited: n(raw.credited),
    refunded: n(raw.refunded),
  };
}

export async function readTerms(asset: PayAsset): Promise<LicenceTerms> {
  const config = (await simulate(contractId(asset), "config", [], ERRORS)) as {
    fee_bps: number;
    hold: bigint;
    treasury: string;
  };
  return {
    feeBps: Number(config.fee_bps),
    holdSecs: Number(config.hold),
    treasury: String(config.treasury),
  };
}

export async function readLicence(asset: PayAsset, id: number): Promise<Licence> {
  const raw = await simulate(
    contractId(asset),
    "licence",
    [nativeToScVal(BigInt(id), { type: "u64" })],
    ERRORS,
  );
  return toLicence(raw as Record<string, unknown>);
}

/** The licence bought under this sale, or null if none was. */
export async function licenceForSale(
  asset: PayAsset,
  saleId: string,
): Promise<number | null> {
  const id = await simulate(
    contractId(asset),
    "licence_for",
    [nativeToScVal(Buffer.from(saleReference(saleId), "hex"))],
    ERRORS,
  );
  return id === null || id === undefined ? null : Number(id as bigint);
}

/** The fee the contract will take on this price at `feeBps`. */
export function feeOf(stroops: number, feeBps: number): number {
  return Math.floor((stroops * feeBps) / 10_000);
}

/** Prepares the buyer's purchase. Unsigned XDR for their wallet. */
export function buildPurchase(
  asset: PayAsset,
  buyer: string,
  items: PurchaseItem[],
): Promise<string> {
  if (items.length === 0) {
    throw new SorobanError("The basket is empty.");
  }
  return buildInvocation(
    buyer,
    contractId(asset),
    "purchase",
    [addressArg(buyer), xdr.ScVal.scvVec(items.map(itemArg))],
    ERRORS,
  );
}

/**
 * Relays the buyer's purchase, and refuses anything else.
 *
 * What comes back is written into the database as licences, so this checks
 * the transaction is `purchase`, by this buyer, for exactly the items the
 * server priced: same receipts, same prices, same sale references, same order.
 */
export function submitPurchase(
  asset: PayAsset,
  signedXdr: string,
  buyer: string,
  items: PurchaseItem[],
): Promise<string> {
  return submitSigned(signedXdr, contractId(asset), ERRORS, {
    method: "purchase",
    addresses: [buyer],
    check: (args) => {
      const signed = args[1] ? (scValToNative(args[1]) as unknown) : null;
      if (!Array.isArray(signed) || signed.length !== items.length) {
        throw new SorobanError(
          "That transaction buys a different basket than the one it was built for.",
        );
      }
      signed.forEach((raw, i) => {
        const line = raw as {
          price: bigint;
          receipt_id: bigint;
          reference: Uint8Array;
        };
        const want = items[i];
        if (
          BigInt(line.price) !== BigInt(want.stroops) ||
          BigInt(line.receipt_id) !== BigInt(want.receiptId) ||
          Buffer.from(line.reference).toString("hex") !==
            saleReference(want.saleId)
        ) {
          throw new SorobanError(
            "That transaction buys a different basket than the one it was built for.",
          );
        }
      });
    },
  });
}

/** Licences one settle call will close. The contract's ceiling is 25. */
export const SETTLE_BATCH = 25;

/** Prepares closing these licences. Anyone may sign it. */
export function buildSettle(
  asset: PayAsset,
  signer: string,
  ids: number[],
): Promise<string> {
  if (ids.length === 0 || ids.length > SETTLE_BATCH) {
    throw new SorobanError(`Settle between 1 and ${SETTLE_BATCH} licences at once.`);
  }
  return buildInvocation(
    signer,
    contractId(asset),
    "settle_many",
    [
      xdr.ScVal.scvVec(
        ids.map((id) => nativeToScVal(BigInt(id), { type: "u64" })),
      ),
    ],
    ERRORS,
  );
}

export function submitSettle(asset: PayAsset, signedXdr: string): Promise<string> {
  return submitSigned(signedXdr, contractId(asset), ERRORS, {
    method: "settle_many",
  });
}
