import { createHash } from "node:crypto";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { PAYOUT_CONTRACT_ID } from "./config";
import {
  addressArg,
  buildInvocation,
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
 * what moves the money out.
 *
 * This module signs nothing at all. It builds transactions for a wallet to sign
 * and relays what comes back — a contributor's claim, and now an operator's
 * credit too. Crediting used to be signed here with a key in the environment,
 * which meant a deployment could not credit anything until someone put a secret
 * on the server, and a leaked server leaked a role. The role now lives where the
 * other two already did: in a wallet, held by a person, named on-chain by the
 * contract itself.
 *
 * Funding the vault is not here either. Money goes in from outside, by whoever
 * chooses to put it there; the server has no way to move it in or out.
 */

/** Mirrors the `Error` enum in contracts/contracts/payout/src/lib.rs. */
const PAYOUT_ERRORS: ErrorTable = {
  1: "That isn't a valid payout amount.",
  2: "That sale has already been credited.",
  3: "The payout vault doesn't hold enough test XLM. Fund it from the operator panel.",
  4: "There's nothing waiting to be claimed.",
  5: "Too many sales to credit in one transaction.",
  6: "That test XLM is already owed to contributors.",
  7: "That wallet isn't one the vault credits for.",
  8: "The vault already has as many operators as it takes.",
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
 * Prepares a batch of sales to be recorded as owed. Returns unsigned XDR for
 * the operator's wallet to sign — the contract checks that signature against
 * the address it holds as operator, so this is authorised by a person's key
 * rather than by our say-so.
 *
 * All or nothing on the contract's side: a batch that fails leaves no partial
 * state, so a caller can rebuild and retry it. A sale already recorded is
 * refused by reference, which is what stops a retry from paying twice.
 */
export function buildCredit(
  signer: string,
  entries: CreditEntry[],
): Promise<string> {
  if (entries.length === 0 || entries.length > CREDIT_BATCH) {
    throw new SorobanError(`Credit between 1 and ${CREDIT_BATCH} sales at once.`);
  }

  return buildInvocation(
    signer,
    contractId(),
    "credit_many",
    // The signer names itself: the contract keeps a set of operators rather
    // than one, and asks whether the address that signed is in it.
    [addressArg(signer), xdr.ScVal.scvVec(entries.map(creditArg))],
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

/**
 * Prepares letting another wallet credit. Only the contract's admin can sign
 * it, and the contract enforces that — this exists so the people running the
 * product can be given the role from the panel rather than from a terminal.
 */
export function buildAddOperator(
  admin: string,
  operator: string,
): Promise<string> {
  return buildInvocation(
    admin,
    contractId(),
    "add_operator",
    [addressArg(operator)],
    PAYOUT_ERRORS,
  );
}

/** Prepares taking the role back — someone leaving, or a key being retired. */
export function buildRemoveOperator(
  admin: string,
  operator: string,
): Promise<string> {
  return buildInvocation(
    admin,
    contractId(),
    "remove_operator",
    [addressArg(operator)],
    PAYOUT_ERRORS,
  );
}

/** Every address the contract lets credit sales. */
export async function readOperators(): Promise<string[]> {
  return (await read("operators")) as string[];
}

/** The address that can hand out the operator role and withdraw the surplus. */
export async function readAdmin(): Promise<string> {
  return (await read("admin")) as string;
}

/**
 * Relays a signed call to the vault and waits for it to land. One function for
 * every call this product makes — a claim, a credit, a role change — because
 * the server's part in all three is identical: check where it points, send it,
 * report the hash. It signs none of them.
 */
export function submitToVault(signedXdr: string): Promise<string> {
  return submitSigned(signedXdr, contractId(), PAYOUT_ERRORS);
}
