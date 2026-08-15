import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  Transaction,
  TransactionBuilder,
  contract,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { STELLAR } from "./config";

/**
 * The parts of talking to a Soroban contract that are the same whichever
 * contract it is: simulate a view, prepare a transaction for a wallet to sign,
 * relay a signed one, and turn a contract error code into a sentence.
 *
 * Both contracts in this product read from here. Consent came first and this
 * module is its machinery, lifted out when payouts needed the same four things
 * — the alternative was two copies of the submit loop, drifting apart on the
 * SDK workaround below.
 */

/** Raised when the network or a contract refuses — carries a showable message. */
export class SorobanError extends Error {}

/** Contract error code → the sentence a person should read. */
export type ErrorTable = Record<number, string>;

export function rpcServer(): rpc.Server {
  return new rpc.Server(STELLAR.sorobanRpcUrl);
}

export function addressArg(value: string): xdr.ScVal {
  return Address.fromString(value).toScVal();
}

/**
 * Failures arrive as a string with the code buried in them
 * (`Error(Contract, #3)`). Pull it out when it is one of the contract's own,
 * and stay vague rather than wrong on everything else.
 */
export function contractMessage(error: string, errors: ErrorTable): string {
  const code = error.match(/Error\(Contract, #(\d+)\)/);
  if (code) {
    const known = errors[Number(code[1])];
    if (known) return known;
  }
  if (error.includes("MissingValue")) {
    return "The contract couldn't find that record on testnet.";
  }
  return "The ledger rejected that. Nothing was recorded.";
}

/**
 * Reads a view function by simulating it — no account, no fee, no signature.
 * The property that makes contract state worth putting on a ledger: anyone can
 * do this, including someone who does not trust us.
 */
export async function simulate(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  errors: ErrorTable,
): Promise<unknown> {
  const tx = new TransactionBuilder(new Account(contract.NULL_ACCOUNT, "0"), {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.networkPassphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await rpcServer().simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new SorobanError(contractMessage(sim.error, errors));
  }
  if (!sim.result) {
    throw new SorobanError("The contract returned nothing.");
  }
  return scValToNative(sim.result.retval);
}

/**
 * Builds a transaction for a wallet to sign, already simulated so the fees and
 * authorisation footprint are real. Returns XDR — the wallet signs it, `submit`
 * sends it back.
 */
export async function buildInvocation(
  source: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  errors: ErrorTable,
): Promise<string> {
  const server = rpcServer();

  const account = await server.getAccount(source).catch(() => {
    throw new SorobanError(
      "That wallet doesn't exist on testnet yet. Fund it first.",
    );
  });

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.networkPassphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(120)
    .build();

  try {
    // prepareTransaction simulates and folds the result — auth entries, resource
    // fees, footprint — back into the transaction. Skipping it produces XDR the
    // network rejects after the user has already signed it.
    return (await server.prepareTransaction(tx)).toXDR();
  } catch (e) {
    throw new SorobanError(
      contractMessage(e instanceof Error ? e.message : String(e), errors),
    );
  }
}

/**
 * Refuses to relay anything that isn't a call to the contract we expect.
 *
 * Without this a submit route is an open transaction relay: it would happily
 * broadcast any signed Stellar transaction, letting a stranger use this server
 * to put arbitrary operations on the network from our address rather than
 * theirs. Nothing is stolen by it — the signer still pays the fee — but it is
 * our infrastructure, and a relay is not what we set out to run.
 */
function assertCallTo(
  tx: Transaction | FeeBumpTransaction,
  contractId: string,
): void {
  if ("innerTransaction" in tx) {
    throw new SorobanError("Fee-bump transactions aren't accepted here.");
  }
  if (tx.operations.length !== 1) {
    throw new SorobanError("That transaction does more than one thing.");
  }

  const operation = tx.operations[0];
  if (operation.type !== "invokeHostFunction") {
    throw new SorobanError("That isn't a contract call.");
  }

  const func = operation.func;
  if (func.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
    throw new SorobanError("That isn't a contract invocation.");
  }

  const target = Address.fromScAddress(
    func.invokeContract().contractAddress(),
  ).toString();
  if (target !== contractId) {
    throw new SorobanError("That call isn't for the contract it claims.");
  }
}

/** How long to wait for a ledger to close on a submitted transaction. */
const POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 1_000;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Sends a signed transaction and waits for the ledger to close on it. Returns
 * the hash, which is the whole point: it resolves on a public explorer, so what
 * happened is checkable by someone who does not trust us.
 *
 * Polling reads the raw RPC response rather than `pollTransaction`, which
 * decodes the transaction meta on the way past. This SDK is a major version
 * behind the network and cannot parse Protocol 23's meta — it throws
 * `Bad union switch: 4` on a transaction that in fact succeeded. Telling
 * someone their claim failed when the money has already moved is the worst
 * answer available here, so we read the status field and leave the meta alone.
 * Upgrading the SDK is the real fix; this keeps the report honest until then.
 */
async function send(
  tx: Transaction | FeeBumpTransaction,
  errors: ErrorTable,
): Promise<string> {
  const server = rpcServer();

  const sent = await server.sendTransaction(tx);
  if (sent.status === "DUPLICATE") {
    throw new SorobanError("That transaction was already submitted.");
  }
  if (sent.status === "ERROR") {
    throw new SorobanError(rejectionMessage(sent));
  }

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const result = await server._getTransaction(sent.hash);

    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return sent.hash;
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new SorobanError(
        contractMessage(
          JSON.stringify(result.resultXdr ?? ""),
          errors,
        ).replace("Nothing was recorded.", "It failed on-chain."),
      );
    }
  }

  throw new SorobanError(
    `Still unconfirmed after ${POLL_ATTEMPTS} tries. It may yet land — check ${sent.hash}.`,
  );
}

/**
 * A rejection before the transaction even reaches a ledger. The generic answer
 * is nearly useless to whoever has to fix it, and one case is common enough to
 * deserve its own sentence: a signing wallet that has run out of XLM for fees.
 * Soroban's resource fees are large enough that a wallet kept deliberately thin
 * — as an operator's is — will hit this while everything else is healthy.
 */
function rejectionMessage(sent: rpc.Api.SendTransactionResponse): string {
  const code = sent.errorResult?.result().switch().name;
  if (code === "txInsufficientBalance") {
    return "The signing key is out of test XLM for fees. Top it up and try again.";
  }
  if (code === "txBadSeq") {
    return "That transaction was built against a stale sequence number. Try again.";
  }
  if (code === "txInsufficientFee") {
    return "The network wants a higher fee than this transaction offered.";
  }
  return code
    ? `The network rejected the transaction (${code}).`
    : "The network rejected the transaction.";
}

/** Relays a transaction someone else signed, after checking where it points. */
export async function submitSigned(
  signedXdr: string,
  contractId: string,
  errors: ErrorTable,
): Promise<string> {
  let tx;
  try {
    tx = TransactionBuilder.fromXDR(signedXdr, STELLAR.networkPassphrase);
  } catch {
    throw new SorobanError("That isn't a signed transaction.");
  }

  assertCallTo(tx, contractId);
  return send(tx, errors);
}

/*
 * There is deliberately no "sign it here" helper. There used to be — crediting
 * a sale was signed with a key in the environment — and it is gone with the key
 * itself. Every call this product makes to a contract is authorised by a person
 * in their own wallet: a contributor claims, an operator credits, an admin hands
 * the role on. This module builds and relays; it never holds the means to sign.
 */
