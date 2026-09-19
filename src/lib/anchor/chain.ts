import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { STELLAR } from "@/lib/stellar/config";
import type { AnchorCurrency } from "./types";

/**
 * The Stellar side of the ramp: the trustline a deposit needs, and the payment
 * a withdrawal is.
 *
 * Both are classic operations built here and signed by the user's own wallet.
 * Nothing in this file can move anything on its own; it hands back XDR.
 *
 * The trustline is also what a contributor needs before they can claim a USDC
 * payout, which is why this is reachable from the earnings page and not only
 * from the ramp: a claim into an account that cannot hold the asset fails at
 * the contract, with a message about trustlines that nobody asked to learn.
 */

const horizon = new Horizon.Server(STELLAR.horizonUrl);

export function assetOf(currency: AnchorCurrency): Asset {
  return new Asset(currency.code, currency.issuer);
}

export type AccountAssetState = {
  /** Does the account exist on the network at all? */
  funded: boolean;
  /** Can it hold this asset? Without it a deposit sits in pending_trust. */
  trusted: boolean;
  /** How much of it the account holds, as a decimal string. */
  balance: string;
};

/**
 * What the account can do with this asset right now.
 *
 * The deposit screen asks before it starts, because the alternative is a user
 * who has "sent" their TRY and then watches the transaction sit in
 * pending_trust with no explanation of what is missing.
 */
export async function readAssetState(
  address: string,
  currency: AnchorCurrency,
): Promise<AccountAssetState> {
  try {
    const account = await horizon.loadAccount(address);
    const line = account.balances.find(
      (b) =>
        "asset_code" in b &&
        b.asset_code === currency.code &&
        "asset_issuer" in b &&
        b.asset_issuer === currency.issuer,
    );
    return {
      funded: true,
      trusted: Boolean(line),
      balance: line && "balance" in line ? line.balance : "0",
    };
  } catch {
    return { funded: false, trusted: false, balance: "0" };
  }
}

/** A changeTrust the user signs, so the anchor has somewhere to pay. */
export async function buildTrustlineTx(
  address: string,
  currency: AnchorCurrency,
): Promise<string> {
  const account = await horizon.loadAccount(address);
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.networkPassphrase,
  })
    .addOperation(Operation.changeTrust({ asset: assetOf(currency) }))
    .setTimeout(120)
    .build()
    .toXDR();
}

/**
 * The withdrawal payment.
 *
 * The memo is the whole identity of the order — the anchor has no other way to
 * tell which withdrawal this money settles — so it is attached here rather
 * than left to the wallet, and a payment built any other way would arrive as
 * an anonymous credit to the treasury.
 */
export async function buildWithdrawPaymentTx(params: {
  from: string;
  destination: string;
  amount: string;
  memo: string;
  memoType: string;
  currency: AnchorCurrency;
}): Promise<string> {
  const account = await horizon.loadAccount(params.from);
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: params.destination,
        asset: assetOf(params.currency),
        amount: params.amount,
      }),
    )
    .addMemo(
      params.memoType === "hash"
        ? Memo.hash(params.memo)
        : params.memoType === "text"
          ? Memo.text(params.memo)
          : Memo.id(params.memo),
    )
    .setTimeout(120)
    .build()
    .toXDR();
}

export async function submitSigned(signedXdr: string): Promise<string> {
  const tx = TransactionBuilder.fromXDR(signedXdr, STELLAR.networkPassphrase);
  const res = await horizon.submitTransaction(tx as Parameters<typeof horizon.submitTransaction>[0]);
  return res.hash;
}

/** Horizon's own words when it rejects a transaction — the useful ones. */
export function submitFailureReason(e: unknown): string {
  const codes = (
    e as {
      response?: {
        data?: { extras?: { result_codes?: { operations?: string[]; transaction?: string } } };
      };
    }
  )?.response?.data?.extras?.result_codes;
  if (codes?.operations?.length) {
    return `the network refused it: ${codes.operations.join(", ")}`;
  }
  if (codes?.transaction) return `the network refused it: ${codes.transaction}`;
  return e instanceof Error ? e.message : "the transaction could not be submitted";
}
