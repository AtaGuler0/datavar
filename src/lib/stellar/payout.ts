import { createHash } from "node:crypto";
import { Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { PAYOUT_CONTRACT_ID } from "./config";
import {
  addressArg,
  buildInvocation,
  invokeAsServer,
  simulate,
  SorobanError,
  submitSigned,
  type ErrorTable,
} from "./soroban";

/**
 * The payout vault, from the server's side.
 *
 * What changed when this contract arrived: a payout is no longer a payment our
 * server decides to send. Test XLM sits in the contract, the server can only
 * say *this wallet is owed this much*, and the contributor's own signature is
 * what moves the money out. This module never signs a claim — it builds one for
 * the wallet to sign, and relays the result.
 *
 * The one thing it does sign is `credit`, with the operator key. That call
 * cannot pay anyone; it only assigns money already in the vault.
 */

/** Mirrors the `Error` enum in contracts/contracts/payout/src/lib.rs. */
const PAYOUT_ERRORS: ErrorTable = {
  1: "That isn't a valid payout amount.",
  2: "That sale has already been credited.",
  3: "The payout vault doesn't hold enough test XLM. Fund it from the operator panel.",
  4: "There's nothing waiting to be claimed.",
  5: "Too many sales to credit in one transaction.",
  6: "That test XLM is already owed to contributors.",
};

/** Sales credited in one transaction. The contract's own ceiling is 50. */
export const CREDIT_BATCH = 25;

export { SorobanError as PayoutError };

export function isPayoutConfigured(): boolean {
  return PAYOUT_CONTRACT_ID.length > 0;
}

function contractId(): string {
  if (!isPayoutConfigured()) {
    throw new SorobanError(
      "The payout contract isn't configured. Set NEXT_PUBLIC_PAYOUT_CONTRACT_ID.",
    );
  }
  return PAYOUT_CONTRACT_ID;
}

function read(method: string, args: xdr.ScVal[] = []): Promise<unknown> {
  return simulate(contractId(), method, args, PAYOUT_ERRORS);
}

/**
 * A sale's identity as the contract sees it: SHA-256 of the row id. The
 * contract treats it as opaque and refuses to see the same one twice, which is
 * what stops a retried batch from paying twice.
 */
export function saleReference(saleId: string): string {
  return createHash("sha256").update(saleId).digest("hex");
}

function referenceArg(hex: string): xdr.ScVal {
  return nativeToScVal(Buffer.from(hex, "hex"));
}

function amountArg(stroops: number): xdr.ScVal {
  return nativeToScVal(BigInt(stroops), { type: "i128" });
}

/** What one contributor can claim right now, in stroops. */
export async function balanceOf(wallet: string): Promise<number> {
  return Number((await read("balance_of", [addressArg(wallet)])) as bigint);
}

/** Whether this sale is already on the ledger as owed. */
export async function isCredited(saleId: string): Promise<boolean> {
  return (await read("is_credited", [
    referenceArg(saleReference(saleId)),
  ])) as boolean;
}

export type Vault = {
  /** Test XLM held by the contract. */
  funded: number;
  /** Of that, how much is spoken for by contributors. */
  owed: number;
  /** The headroom left for new credits. */
  surplus: number;
};

/** The vault's state, as the operator panel shows it. */
export async function readVault(): Promise<Vault> {
  const [funded, owed] = await Promise.all([
    read("funded") as Promise<bigint>,
    read("owed") as Promise<bigint>,
  ]);
  return {
    funded: Number(funded),
    owed: Number(owed),
    surplus: Number(funded) - Number(owed),
  };
}

/** One line of a credit batch. */
export type CreditEntry = {
  wallet: string;
  stroops: number;
  saleId: string;
};

/**
 * A `Credit` struct as the contract reads it. Soroban encodes a struct as a map
 * keyed by field name, and the keys have to be in the order the host expects —
 * which is alphabetical, hence amount, contributor, reference.
 */
function creditArg(entry: CreditEntry): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: nativeToScVal("amount", { type: "symbol" }),
      val: amountArg(entry.stroops),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("contributor", { type: "symbol" }),
      val: addressArg(entry.wallet),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("reference", { type: "symbol" }),
      val: referenceArg(saleReference(entry.saleId)),
    }),
  ]);
}

/**
 * Records a batch of sales as owed. Signed with the operator key, which is the
 * only thing this server's key can do to the vault: it cannot pay a
 * contributor, cannot pay itself, and cannot take a credit back.
 *
 * All or nothing on the contract's side — a batch that fails leaves no partial
 * state, so the caller can safely rebuild and retry it.
 */
export function creditSales(
  secret: string,
  entries: CreditEntry[],
): Promise<string> {
  if (entries.length === 0 || entries.length > CREDIT_BATCH) {
    throw new SorobanError(`Credit between 1 and ${CREDIT_BATCH} sales at once.`);
  }

  return invokeAsServer(
    secret,
    contractId(),
    "credit_many",
    [xdr.ScVal.scvVec(entries.map(creditArg))],
    PAYOUT_ERRORS,
  );
}

/**
 * Moves test XLM from the treasury account into the vault. The one direction
 * that is ours to choose: money can always go in, and once it is credited to
 * someone it can only come back out as their claim.
 */
export function fundVault(secret: string, stroops: number): Promise<string> {
  if (stroops <= 0) {
    throw new SorobanError("Fund the vault with more than nothing.");
  }

  const treasury = Keypair.fromSecret(secret).publicKey();
  return invokeAsServer(
    secret,
    contractId(),
    "fund",
    [addressArg(treasury), amountArg(stroops)],
    PAYOUT_ERRORS,
  );
}

/**
 * Prepares the contributor's claim. Returns unsigned XDR: this server cannot
 * claim on anyone's behalf, and the contract checks their signature rather than
 * our word about who was asking.
 */
export function buildClaim(wallet: string): Promise<string> {
  return buildInvocation(
    wallet,
    contractId(),
    "claim",
    [addressArg(wallet)],
    PAYOUT_ERRORS,
  );
}

/** Relays a claim the contributor's wallet signed, and waits for it to land. */
export function submitClaim(signedXdr: string): Promise<string> {
  return submitSigned(signedXdr, contractId(), PAYOUT_ERRORS);
}
