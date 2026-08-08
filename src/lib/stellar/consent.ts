import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  contract,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { CONSENT_CONTRACT_ID, STELLAR } from "./config";

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
 * and submits the signed result; the key never leaves their wallet.
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
export class ConsentError extends Error {}

export function isConsentConfigured(): boolean {
  return CONSENT_CONTRACT_ID.length > 0;
}

function server(): rpc.Server {
  return new rpc.Server(STELLAR.sorobanRpcUrl);
}

function consentContract(): Contract {
  if (!isConsentConfigured()) {
    throw new ConsentError(
      "The consent contract isn't configured. Set NEXT_PUBLIC_CONSENT_CONTRACT_ID.",
    );
  }
  return new Contract(CONSENT_CONTRACT_ID);
}

/**
 * The contract's own error codes, in the words a contributor would use. Kept in
 * sync by hand with the `Error` enum in contracts/contracts/consent/src/lib.rs.
 */
const CONTRACT_ERRORS: Record<number, string> = {
  1: "No receipt with that id.",
  2: "That consent was already revoked.",
  3: "Consent has to end in the future. Pick a later date.",
  4: "That purpose is too long — keep it under 200 characters.",
  5: "This wallet has reached the receipt limit.",
  6: "Asked for too many receipts at once.",
};

/**
 * Simulation failures arrive as a string with the code buried in it
 * (`Error(Contract, #3)`). Pull it out when it's one of ours, and stay vague
 * rather than wrong on everything else.
 */
function simulationMessage(error: string): string {
  const code = error.match(/Error\(Contract, #(\d+)\)/);
  if (code) {
    const known = CONTRACT_ERRORS[Number(code[1])];
    if (known) return known;
  }
  if (error.includes("MissingValue")) {
    return "The contract couldn't find that record on testnet.";
  }
  return "The ledger rejected that. Nothing was recorded.";
}

/** Reads a view function by simulating it — no account, no fee, no signature. */
async function simulate(method: string, args: xdr.ScVal[]): Promise<unknown> {
  const tx = new TransactionBuilder(new Account(contract.NULL_ACCOUNT, "0"), {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.networkPassphrase,
  })
    .addOperation(consentContract().call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server().simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new ConsentError(simulationMessage(sim.error));
  }
  if (!sim.result) {
    throw new ConsentError("The contract returned nothing.");
  }
  return scValToNative(sim.result.retval);
}

function addressArg(value: string): xdr.ScVal {
  return Address.fromString(value).toScVal();
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
  const count = Number(await simulate("receipt_count", [addressArg(wallet)]));
  if (count === 0) return [];

  const ceiling = Math.min(count, MAX_RECEIPTS_READ);
  const now = Math.floor(Date.now() / 1000);
  const receipts: ConsentReceipt[] = [];

  for (let start = 0; start < ceiling; start += PAGE_SIZE) {
    const page = (await simulate("receipts_of", [
      addressArg(wallet),
      nativeToScVal(start, { type: "u32" }),
      nativeToScVal(Math.min(PAGE_SIZE, ceiling - start), { type: "u32" }),
    ])) as RawReceipt[];
    receipts.push(...page.map((raw) => toReceipt(raw, now)));
  }

  return receipts.reverse();
}

/**
 * Builds a transaction for the contributor to sign, already simulated so the
 * fees and authorisation footprint are real. Returns XDR — the wallet signs it,
 * `submit` sends it back.
 */
async function build(
  source: string,
  method: string,
  args: xdr.ScVal[],
): Promise<string> {
  const rpcServer = server();

  const account = await rpcServer.getAccount(source).catch(() => {
    throw new ConsentError(
      "That wallet doesn't exist on testnet yet. Fund it first.",
    );
  });

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.networkPassphrase,
  })
    .addOperation(consentContract().call(method, ...args))
    .setTimeout(120)
    .build();

  try {
    // prepareTransaction simulates and folds the result — auth entries, resource
    // fees, footprint — back into the transaction. Skipping it produces XDR the
    // network rejects after the user has already signed it.
    return (await rpcServer.prepareTransaction(tx)).toXDR();
  } catch (e) {
    throw new ConsentError(
      simulationMessage(e instanceof Error ? e.message : String(e)),
    );
  }
}

export function buildGrant(input: {
  contributor: string;
  buyer: string;
  datasetHash: string;
  purpose: string;
  expiresAt: number;
}): Promise<string> {
  return build(input.contributor, "grant", [
    addressArg(input.contributor),
    addressArg(input.buyer),
    nativeToScVal(Buffer.from(input.datasetHash, "hex")),
    nativeToScVal(input.purpose, { type: "string" }),
    nativeToScVal(BigInt(input.expiresAt), { type: "u64" }),
  ]);
}

export function buildRevoke(input: {
  contributor: string;
  receiptId: string;
}): Promise<string> {
  return build(input.contributor, "revoke", [
    nativeToScVal(BigInt(input.receiptId), { type: "u64" }),
  ]);
}

/** How long to wait for a ledger to close on a submitted transaction. */
const POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 1_000;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Sends a signed transaction and waits for the ledger to close on it. Returns
 * the hash, which is the whole point: it resolves on a public explorer, so the
 * receipt is checkable by someone who does not trust us.
 *
 * Polling reads the raw RPC response rather than `pollTransaction`, which
 * decodes the transaction meta on the way past. This SDK is a major version
 * behind the network and cannot parse Protocol 23's meta — it throws
 * `Bad union switch: 4` on a transaction that in fact succeeded. Telling a
 * contributor their consent failed when it is already on the ledger is the
 * worst answer available here, so we read the status field and leave the meta
 * alone. Upgrading the SDK is the real fix; this keeps the report honest until
 * then.
 */
export async function submit(signedXdr: string): Promise<string> {
  const rpcServer = server();

  let tx;
  try {
    tx = TransactionBuilder.fromXDR(signedXdr, STELLAR.networkPassphrase);
  } catch {
    throw new ConsentError("That isn't a signed transaction.");
  }

  const sent = await rpcServer.sendTransaction(tx);
  if (sent.status === "ERROR" || sent.status === "DUPLICATE") {
    throw new ConsentError(
      sent.status === "DUPLICATE"
        ? "That transaction was already submitted."
        : "The network rejected the transaction.",
    );
  }

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const result = await rpcServer._getTransaction(sent.hash);

    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return sent.hash;
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new ConsentError("The transaction failed on-chain.");
    }
  }

  throw new ConsentError(
    `Still unconfirmed after ${POLL_ATTEMPTS} tries. It may yet land — check ${sent.hash}.`,
  );
}
