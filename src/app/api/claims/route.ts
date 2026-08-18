import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { AuthConfigError, issueToken } from "@/lib/auth/jwt";
import { readSession } from "@/lib/auth/session";
import { supabaseForToken } from "@/lib/supabase/client";
import {
  balanceOf,
  buildClaim,
  isPayoutConfigured,
  PayoutError,
  submitClaim,
} from "@/lib/stellar/payout";

/**
 * Claiming a payout.
 *
 * This route used to hold the treasury key and send the payment itself, which
 * meant a contributor's earnings were ours until we chose to part with them.
 * They are not any more: the money sits in the payout contract, and the only
 * signature that can move it to a contributor is the contributor's own. So this
 * route holds no key and pays nobody. It does two things.
 *
 * `build` asks the contract what this wallet is owed and returns an unsigned
 * transaction for their wallet to sign. `submit` relays the signed result and
 * then records the outcome against the sales it settled — after checking the
 * transaction is a `claim` for the session's own wallet, because the record it
 * writes is only true if that is what the transaction was.
 *
 * Which wallet is claiming comes from the signed session, never from the
 * request body — but note that this now matters far less than it did. Even a
 * forged body cannot misdirect a payout, because the contract pays the address
 * that authorised the call and nothing else.
 *
 * The database write still needs the `settle` claim that the sales update
 * policy requires, minted here and good for two minutes. Marking a payout
 * claimed remains something only this route can do — see can_settle() in
 * schema.sql.
 */

// stellar-sdk needs Node built-ins; the edge runtime can't carry it.
export const runtime = "nodejs";

/** Long enough to record a claim; short enough to be useless if it leaked. */
const SETTLE_TTL_SECONDS = 120;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  // Who is asking comes before what the server has configured: a stranger has
  // no business learning whether payouts are set up here.
  const session = readSession(request);
  if (!session) {
    return fail("Sign in with your wallet to claim a payout.", 401);
  }
  const wallet = session.wallet;
  if (!StrKey.isValidEd25519PublicKey(wallet)) {
    return fail("That session isn't for a Stellar address.", 400);
  }

  if (!isPayoutConfigured()) {
    return fail(
      "Payouts aren't configured. Set NEXT_PUBLIC_PAYOUT_CONTRACT_ID on the server.",
      503,
    );
  }

  let body: { action?: unknown; xdr?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  try {
    if (body.action === "build") {
      const stroops = await balanceOf(wallet);
      if (stroops <= 0) {
        // Sales exist but nothing is credited yet: the honest answer is that
        // the money isn't in the vault, not that the claim failed.
        return fail(
          "Nothing is waiting in the payout contract for this wallet yet.",
          409,
        );
      }
      return NextResponse.json({ xdr: await buildClaim(wallet), stroops });
    }

    if (body.action === "submit") {
      if (typeof body.xdr !== "string" || !body.xdr) {
        return fail("A signed transaction is required.", 400);
      }
      // Narrowed to `claim`, for this session's wallet. What lands here is
      // recorded as a payout the moment it succeeds, so "it reached the vault"
      // is not enough to know on — it has to be the call that pays.
      const hash = await submitClaim(body.xdr, wallet);
      return NextResponse.json({ hash, ...(await settle(wallet, hash)) });
    }

    return fail("Unknown action.", 400);
  } catch (e) {
    if (e instanceof PayoutError) return fail(e.message, 502);
    return fail("Couldn't reach the payout contract. Try again.", 502);
  }
}

/**
 * Records the claim against the sales it paid for. The money has already moved
 * by the time this runs, so a failure here is reported rather than treated as a
 * failed payout — the hash is the truth, and the row is our copy of it.
 */
async function settle(
  wallet: string,
  hash: string,
): Promise<{ warning?: string }> {
  let supabase;
  try {
    // Deliberately not session.admin: this token exists to settle rows, and an
    // operator claiming their own payout has no reason to carry operator rights
    // into it.
    const { token } = issueToken({
      wallet,
      admin: false,
      ttlSeconds: SETTLE_TTL_SECONDS,
      settle: true,
    });
    supabase = supabaseForToken(token);
  } catch (e) {
    return {
      warning:
        e instanceof AuthConfigError
          ? e.message
          : "Paid on-chain, but the payout couldn't be marked claimed.",
    };
  }

  // Everything credited and not yet claimed: a claim empties the wallet's whole
  // balance in the contract, so it settles all of them at once.
  const { error } = await supabase
    .from("sales")
    .update({
      status: "claimed",
      tx_hash: hash,
      claimed_at: new Date().toISOString(),
    })
    .eq("owner_wallet", wallet)
    .eq("status", "unclaimed")
    .not("credited_at", "is", null);

  if (error) {
    return {
      warning:
        "Paid on-chain, but the payout couldn't be marked claimed. Note the hash.",
    };
  }
  return {};
}
