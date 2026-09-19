import { createHash } from "node:crypto";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { isAssetConfigured, vaultFor, type PayAsset } from "./config";
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
 * Funding the vault is not signed here either. Money goes in from outside, by
 * whoever chooses to put it there; the server has no way to move it in or out.
 * What it can do, since buyers arrived, is prepare the call for them — the
 * contract lets anyone fund, so a purchase is the buyer putting their own money
 * into the same vault every contributor claims from, with their own signature.
 *
 * There are two vaults now, one per asset, and every function here takes which
 * one it means as its first argument. That is deliberately not a default: an
 * amount is the same kind of integer in both, so a call that forgot to say
 * would work, pay the wrong contributor balance out of the wrong contract, and
 * report success. Making it impossible to forget costs one word per call site.
 */

/**
 * Mirrors the `Error` enum in contracts/contracts/payout/src/lib.rs.
 *
 * Built per asset rather than written twice, because two of these sentences
 * name the money and a USDC vault reporting a shortage of test XLM would send
 * whoever read it looking in the wrong place.
 */
function errorsFor(asset: PayAsset): ErrorTable {
  const money = asset === "USDC" ? "USDC" : "test XLM";
  return {
    1: "That isn't a valid payout amount.",
    2: "That sale has already been credited.",
    3: `The ${asset} payout vault doesn't hold enough ${money}. Fund it from the operator panel.`,
    4: "There's nothing waiting to be claimed.",
    5: "Too many sales to credit in one transaction.",
    6: `That ${money} is already owed to contributors.`,
    7: "That wallet isn't one the vault credits for.",
    8: "The vault already has as many operators as it takes.",
  };
}

/** Sales credited in one transaction. The contract's own ceiling is 50. */
export const CREDIT_BATCH = 25;

export { SorobanError as PayoutError };

export { isAssetConfigured };

function contractId(asset: PayAsset): string {
  if (!isAssetConfigured(asset)) {
    throw new SorobanError(
      asset === "USDC"
        ? "The USDC payout vault isn't configured. Set NEXT_PUBLIC_PAYOUT_USDC_CONTRACT_ID."
        : "The payout contract isn't configured. Set NEXT_PUBLIC_PAYOUT_CONTRACT_ID.",
    );
  }
  return vaultFor(asset);
}

function read(
  asset: PayAsset,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<unknown> {
  return simulate(contractId(asset), method, args, errorsFor(asset));
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

/** What one contributor can claim right now, in the asset's own units. */
export async function balanceOf(
  asset: PayAsset,
  wallet: string,
): Promise<number> {
  return Number(
    (await read(asset, "balance_of", [addressArg(wallet)])) as bigint,
  );
}

/** Whether this sale is already on the ledger as owed. */
export async function isCredited(
  asset: PayAsset,
  saleId: string,
): Promise<boolean> {
  return (await read(asset, "is_credited", [
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
export async function readVault(asset: PayAsset): Promise<Vault> {
  const [funded, owed] = await Promise.all([
    read(asset, "funded") as Promise<bigint>,
    read(asset, "owed") as Promise<bigint>,
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
  asset: PayAsset,
  signer: string,
  entries: CreditEntry[],
): Promise<string> {
  if (entries.length === 0 || entries.length > CREDIT_BATCH) {
    throw new SorobanError(`Credit between 1 and ${CREDIT_BATCH} sales at once.`);
  }

  return buildInvocation(
    signer,
    contractId(asset),
    "credit_many",
    // The signer names itself: the contract keeps a set of operators rather
    // than one, and asks whether the address that signed is in it.
    [addressArg(signer), xdr.ScVal.scvVec(entries.map(creditArg))],
    errorsFor(asset),
  );
}

/**
 * Prepares the contributor's claim. Returns unsigned XDR: this server cannot
 * claim on anyone's behalf, and the contract checks their signature rather than
 * our word about who was asking.
 */
export function buildClaim(asset: PayAsset, wallet: string): Promise<string> {
  return buildInvocation(
    wallet,
    contractId(asset),
    "claim",
    [addressArg(wallet)],
    errorsFor(asset),
  );
}

/**
 * Prepares letting another wallet credit. Only the contract's admin can sign
 * it, and the contract enforces that — this exists so the people running the
 * product can be given the role from the panel rather than from a terminal.
 */
export function buildAddOperator(
  asset: PayAsset,
  admin: string,
  operator: string,
): Promise<string> {
  return buildInvocation(
    admin,
    contractId(asset),
    "add_operator",
    [addressArg(operator)],
    errorsFor(asset),
  );
}

/** Prepares taking the role back — someone leaving, or a key being retired. */
export function buildRemoveOperator(
  asset: PayAsset,
  admin: string,
  operator: string,
): Promise<string> {
  return buildInvocation(
    admin,
    contractId(asset),
    "remove_operator",
    [addressArg(operator)],
    errorsFor(asset),
  );
}

/** Every address the contract lets credit sales. */
export async function readOperators(asset: PayAsset): Promise<string[]> {
  return (await read(asset, "operators")) as string[];
}

/** The address that can hand out the operator role and withdraw the surplus. */
export async function readAdmin(asset: PayAsset): Promise<string> {
  return (await read(asset, "admin")) as string;
}

/**
 * Relays a signed call to the vault and waits for it to land. The operator's
 * calls come through here — a credit, a role change — and what they did is
 * checked afterwards against the ledger rather than taken from the transaction:
 * `record` asks `is_credited` about every sale before marking one. It signs
 * none of them.
 */
export function submitToVault(
  asset: PayAsset,
  signedXdr: string,
): Promise<string> {
  return submitSigned(signedXdr, contractId(asset), errorsFor(asset));
}

/**
 * The same, for a contributor's claim — and narrower on purpose.
 *
 * A claim is the one relay whose success is written straight into the database:
 * the sales it settled are marked paid the moment this returns. Checking only
 * that the transaction pointed at the vault left that write standing on the
 * caller's word, because any call to the vault lands successfully — a view
 * function costs nothing and settles nothing, and the rows would have been
 * marked anyway. So this insists the transaction is `claim`, for the wallet
 * whose session is asking. Then a hash that comes back means the money moved.
 */
export function submitClaim(
  asset: PayAsset,
  signedXdr: string,
  wallet: string,
): Promise<string> {
  return submitSigned(signedXdr, contractId(asset), errorsFor(asset), {
    method: "claim",
    addresses: [wallet],
  });
}

/**
 * Prepares a payment into the vault. Anyone may fund it — the contract says so
 * in as many words — and a marketplace purchase is exactly that: the buyer
 * moves their own test XLM into the contract, and what they bought becomes a
 * credit an operator writes against it.
 *
 * The buyer signs this, not us. So the money does not pass through an account
 * of ours on its way to the people it belongs to, and there is no moment where
 * a purchase is sitting somewhere we could keep it.
 */
export function buildFund(
  asset: PayAsset,
  buyer: string,
  stroops: number,
): Promise<string> {
  if (!Number.isInteger(stroops) || stroops <= 0) {
    throw new SorobanError("That isn't a valid amount to pay.");
  }

  return buildInvocation(
    buyer,
    contractId(asset),
    "fund",
    [addressArg(buyer), amountArg(stroops)],
    errorsFor(asset),
  );
}

/**
 * Relays a buyer's funding transaction, and refuses anything that isn't one.
 *
 * Narrow for the same reason `submitClaim` is: what comes back is written
 * straight into the database as licences the buyer now holds. Checking only
 * that the call pointed at the vault would let any successful call to it —
 * a view function costs nothing — stand in for a payment. So this insists on
 * `fund`, by the wallet whose session is asking, for the exact total the
 * server priced the basket at.
 */
export function submitFund(
  asset: PayAsset,
  signedXdr: string,
  buyer: string,
  stroops: number,
): Promise<string> {
  return submitSigned(signedXdr, contractId(asset), errorsFor(asset), {
    method: "fund",
    addresses: [buyer],
    amount: { index: 1, stroops },
  });
}
