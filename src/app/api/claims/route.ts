import { NextResponse } from "next/server";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { supabase } from "@/lib/supabase/client";
import {
  STELLAR,
  STROOPS_PER_XLM,
  stroopsToAmount,
} from "@/lib/stellar/config";
import type { Sale } from "@/lib/supabase/sales";

/**
 * Claiming a sale. This is the one route in the product that moves value, so
 * it is also the one place the treasury secret is read — the browser never
 * sees it, and never signs a payout itself.
 *
 * The shape is: take the row, pay it, then record what happened. Taking the
 * row first is what makes a double-clicked claim safe — the status moves to
 * 'claiming' under a conditional update, so the second request finds nothing
 * left to take. If the payment then fails the row goes back to 'unclaimed'.
 */

// stellar-sdk needs Node built-ins; the edge runtime can't carry it.
export const runtime = "nodejs";

/**
 * Bonus paid alongside a first claim that has to create the account: Stellar's
 * base reserve is 1 XLM, so an account funded with the payout alone would be
 * unusable.
 */
const NEW_ACCOUNT_RESERVE_STROOPS = 2 * STROOPS_PER_XLM;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const secret = process.env.STELLAR_TREASURY_SECRET;
  if (!secret) {
    return fail(
      "Payouts aren't configured. Set STELLAR_TREASURY_SECRET on the server.",
      503,
    );
  }

  let body: { saleId?: unknown; wallet?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const saleId = typeof body.saleId === "string" ? body.saleId : null;
  const wallet = typeof body.wallet === "string" ? body.wallet : null;
  if (!saleId || !wallet) {
    return fail("Both saleId and wallet are required.", 400);
  }
  if (!StrKey.isValidEd25519PublicKey(wallet)) {
    return fail("That isn't a Stellar address.", 400);
  }

  // Claim the row before paying: only the request that flips unclaimed →
  // claiming gets to continue, and it can only do so for its own wallet.
  const { data: taken, error: takeError } = await supabase
    .from("sales")
    .update({ status: "claiming" })
    .eq("id", saleId)
    .eq("owner_wallet", wallet)
    .eq("status", "unclaimed")
    .select()
    .maybeSingle();

  if (takeError) {
    return fail("Couldn't reach the ledger. Try again.", 502);
  }
  if (!taken) {
    // Either it isn't this wallet's sale, or someone already claimed it.
    return fail("That payout isn't available to claim.", 409);
  }

  const sale = taken as Sale;
  const release = (status: "unclaimed") =>
    supabase.from("sales").update({ status }).eq("id", sale.id);

  try {
    const server = new Horizon.Server(STELLAR.horizonUrl);
    const treasury = Keypair.fromSecret(secret);
    const stroops = Number(sale.price_stroops);

    // A payment to an account that doesn't exist yet fails on Stellar, so a
    // contributor whose wallet has never been funded gets created instead —
    // their first claim opens the account and lands the payout in one go.
    const destinationExists = await server
      .loadAccount(wallet)
      .then(() => true)
      .catch(() => false);

    const source = await server.loadAccount(treasury.publicKey());
    const operation = destinationExists
      ? Operation.payment({
          destination: wallet,
          asset: Asset.native(),
          amount: stroopsToAmount(stroops),
        })
      : Operation.createAccount({
          destination: wallet,
          startingBalance: stroopsToAmount(
            stroops + NEW_ACCOUNT_RESERVE_STROOPS,
          ),
        });

    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(operation)
      // The memo is the audit trail: the sale this payment settles, readable
      // from the transaction alone. A text memo is 28 bytes, which is exactly
      // the prefix plus the significant half of a UUID.
      .addMemo(Memo.text(`datavar:${sale.id.slice(0, 20)}`))
      .setTimeout(60)
      .build();

    tx.sign(treasury);
    const result = await server.submitTransaction(tx);

    const { error: settleError } = await supabase
      .from("sales")
      .update({
        status: "claimed",
        tx_hash: result.hash,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", sale.id);

    // The money moved. If recording it didn't, say so plainly rather than
    // reverting a row whose payment is already final on-chain.
    if (settleError) {
      return NextResponse.json(
        {
          hash: result.hash,
          warning:
            "Paid on-chain, but the payout couldn't be marked claimed. Note the hash.",
        },
        { status: 200 },
      );
    }

    return NextResponse.json({ hash: result.hash });
  } catch (e) {
    await release("unclaimed");
    return fail(horizonMessage(e), 502);
  }
}

/**
 * Horizon buries the useful part of a rejection in result_codes. Surface the
 * two an operator will actually hit, and stay vague rather than wrong on the
 * rest.
 */
function horizonMessage(e: unknown): string {
  const codes = (
    e as {
      response?: { data?: { extras?: { result_codes?: Record<string, unknown> } } };
    }
  )?.response?.data?.extras?.result_codes;

  const operation = Array.isArray(codes?.operations)
    ? String(codes.operations[0])
    : null;

  if (operation === "op_underfunded" || codes?.transaction === "tx_insufficient_balance") {
    return "The treasury is out of test XLM. Top it up from the admin panel.";
  }
  if (operation === "op_no_destination") {
    return "That wallet doesn't exist on testnet yet.";
  }
  return "The payout didn't go through. Nothing was charged — try again.";
}
