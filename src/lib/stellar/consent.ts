import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { CONSENT_CONTRACT_ID } from "./config";
import {
  addressArg,
  buildInvocation,
  simulate,
  SorobanError,
  submitSigned,
  type ErrorTable,
} from "./soroban";

/**
 * The browser side of the consent contract, kept on the server.
 *
 * Two reasons it lives here rather than in a client component. One is the same
 * reason `horizon.ts` exists: the SDK is half a megabyte of transaction
 * machinery, and shipping it to every dashboard visitor to read four fields is
 * a bad trade. The other is that reading a receipt needs no wallet at all —
 * simulation against a null account is enough, which is precisely the property
 * that makes consent-on-a-ledger worth arguing for.
 *
 * Signing still belongs to the contributor. This module builds the transaction
 * and submits the signed result; the key never leaves their wallet. The
 * transport underneath is in `soroban.ts`, shared with the payout vault.
 */

/** Largest page the contract will hand back in one call. Mirrors MAX_PAGE. */
const PAGE_SIZE = 50;
/** Ceiling on how many receipts one dashboard load will walk. */
const MAX_RECEIPTS_READ = 200;

export type ReceiptStatus = "active" | "revoked" | "expired";

/** A consent receipt, flattened into the shape the dashboard renders. */
export type ConsentReceipt = {
  id: string;
  contributor: string;
  buyer: string;
  datasetHash: string;
  purpose: string;
  grantedAt: number;
  expiresAt: number;
  revokedAt: number | null;
  status: ReceiptStatus;
};

/** Raised when the contract itself refuses — carries a message worth showing. */
export { SorobanError as ConsentError };

/**
 * The contract's own error codes, in the words a contributor would use. Kept in
 * sync by hand with the `Error` enum in contracts/contracts/consent/src/lib.rs.
 */
const CONSENT_ERRORS: ErrorTable = {
  1: "No receipt with that id.",
  2: "That consent was already revoked.",
  3: "Consent has to end in the future. Pick a later date.",
  4: "That purpose is too long — keep it under 200 characters.",
  5: "This wallet has reached the receipt limit.",
  6: "Asked for too many receipts at once.",
};

export function isConsentConfigured(): boolean {
  return CONSENT_CONTRACT_ID.length > 0;
}

function contractId(): string {
  if (!isConsentConfigured()) {
    throw new SorobanError(
      "The consent contract isn't configured. Set NEXT_PUBLIC_CONSENT_CONTRACT_ID.",
    );
  }
  return CONSENT_CONTRACT_ID;
}

function read(method: string, args: xdr.ScVal[]): Promise<unknown> {
  return simulate(contractId(), method, args, CONSENT_ERRORS);
}

function statusOf(
  expiresAt: number,
  revokedAt: number | null,
  now: number,
): ReceiptStatus {
  if (revokedAt !== null) return "revoked";
  return now < expiresAt ? "active" : "expired";
}

type RawReceipt = {
  id: bigint;
  contributor: string;
  buyer: string;
  dataset_hash: Buffer;
  purpose: string;
  granted_at: bigint;
  expires_at: bigint;
  revoked_at: bigint | null;
};

function toReceipt(raw: RawReceipt, now: number): ConsentReceipt {
  const expiresAt = Number(raw.expires_at);
  const revokedAt = raw.revoked_at === null ? null : Number(raw.revoked_at);
  return {
    id: raw.id.toString(),
    contributor: raw.contributor,
    buyer: raw.buyer,
    datasetHash: Buffer.from(raw.dataset_hash).toString("hex"),
    purpose: raw.purpose,
    grantedAt: Number(raw.granted_at),
    expiresAt,
    revokedAt,
    status: statusOf(expiresAt, revokedAt, now),
  };
}

/**
 * Every receipt a wallet has granted, newest first. Paged because the contract
 * caps what one call returns; walked to a ceiling because a dashboard load
 * should not be able to turn into an unbounded number of round trips.
 */
export async function listReceipts(wallet: string): Promise<ConsentReceipt[]> {
  const count = Number(await read("receipt_count", [addressArg(wallet)]));
  if (count === 0) return [];

  const ceiling = Math.min(count, MAX_RECEIPTS_READ);
  const now = Math.floor(Date.now() / 1000);
  const receipts: ConsentReceipt[] = [];

  for (let start = 0; start < ceiling; start += PAGE_SIZE) {
    const page = (await read("receipts_of", [
      addressArg(wallet),
      nativeToScVal(start, { type: "u32" }),
      nativeToScVal(Math.min(PAGE_SIZE, ceiling - start), { type: "u32" }),
    ])) as RawReceipt[];
    receipts.push(...page.map((raw) => toReceipt(raw, now)));
  }

  return receipts.reverse();
}

export function buildGrant(input: {
  contributor: string;
  buyer: string;
  datasetHash: string;
  purpose: string;
  expiresAt: number;
}): Promise<string> {
  return buildInvocation(
    input.contributor,
    contractId(),
    "grant",
    [
      addressArg(input.contributor),
      addressArg(input.buyer),
      nativeToScVal(Buffer.from(input.datasetHash, "hex")),
      nativeToScVal(input.purpose, { type: "string" }),
      nativeToScVal(BigInt(input.expiresAt), { type: "u64" }),
    ],
    CONSENT_ERRORS,
  );
}

export function buildRevoke(input: {
  contributor: string;
  receiptId: string;
}): Promise<string> {
  return buildInvocation(
    input.contributor,
    contractId(),
    "revoke",
    [nativeToScVal(BigInt(input.receiptId), { type: "u64" })],
    CONSENT_ERRORS,
  );
}

/**
 * Sends a signed transaction and waits for the ledger to close on it. Refuses
 * anything that isn't a call to the consent contract — see `submitSigned`.
 */
export function submit(signedXdr: string): Promise<string> {
  return submitSigned(signedXdr, contractId(), CONSENT_ERRORS);
}
