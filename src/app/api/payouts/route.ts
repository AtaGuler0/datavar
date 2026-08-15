import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { AuthConfigError, issueToken } from "@/lib/auth/jwt";
import { readSession } from "@/lib/auth/session";
import { supabaseForToken } from "@/lib/supabase/client";
import {
  balanceOf,
  CREDIT_BATCH,
  creditSales,
  fundVault,
  isCredited,
  isPayoutConfigured,
  PayoutError,
  readVault,
  type CreditEntry,
} from "@/lib/stellar/payout";

/**
 * The payout vault: what it holds, and putting sales into it.
 *
 * `GET` reads the contract and needs no session. That is deliberate — the vault
 * is the product's claim that contributor earnings are not ours to withhold,
 * and a claim nobody can check is not worth making. What it holds and what it
 * owes are public because they have to be.
 *
 * `POST` is the operator's: it writes sales into the vault, which is the moment
 * money stops being ours. The operator key can do nothing else there. It cannot
 * pay a contributor, cannot pay itself, and cannot undo a credit.
 */

// stellar-sdk needs Node built-ins; the edge runtime can't carry it.
export const runtime = "nodejs";

/** Long enough to credit a round and record it. */
const OPERATOR_TTL_SECONDS = 300;

/** Ceiling on how many sales one sync will push on-chain. */
const MAX_PER_SYNC = 200;

type PendingSale = {
  id: string;
  owner_wallet: string;
  price_stroops: number;
};

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  if (!isPayoutConfigured()) {
    return fail("The payout contract isn't configured on this deployment.", 503);
  }

  const wallet = new URL(request.url).searchParams.get("wallet");
  if (wallet && !StrKey.isValidEd25519PublicKey(wallet)) {
    return fail("That isn't a Stellar address.", 400);
  }

  try {
    const [vault, balance] = await Promise.all([
      readVault(),
      wallet ? balanceOf(wallet) : Promise.resolve(null),
    ]);
    return NextResponse.json({ vault, balance });
  } catch (e) {
    if (e instanceof PayoutError) return fail(e.message, 502);
    return fail("Couldn't reach the payout contract.", 502);
  }
}

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session?.admin) {
    return fail("Only an operator can credit payouts.", 403);
  }
  if (!isPayoutConfigured()) {
    return fail("The payout contract isn't configured on this deployment.", 503);
  }

  const secret = process.env.STELLAR_TREASURY_SECRET;
  if (!secret) {
    return fail(
      "The operator key isn't configured. Set STELLAR_TREASURY_SECRET on the server.",
      503,
    );
  }

  let body: { action?: unknown; stroops?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // An empty body means the default action, which is crediting.
  }

  if (body.action === "fund") {
    const stroops =
      typeof body.stroops === "number" ? Math.floor(body.stroops) : 0;
    if (stroops <= 0) {
      return fail("Say how much to move into the vault.", 400);
    }
    try {
      const hash = await fundVault(secret, stroops);
      return NextResponse.json({ hash, vault: await vault() });
    } catch (e) {
      if (e instanceof PayoutError) return fail(e.message, 502);
      return fail("The vault couldn't be funded.", 502);
    }
  }

  let supabase;
  try {
    const { token } = issueToken({
      wallet: session.wallet,
      admin: true,
      ttlSeconds: OPERATOR_TTL_SECONDS,
    });
    supabase = supabaseForToken(token);
  } catch (e) {
    return fail(
      e instanceof AuthConfigError ? e.message : "Couldn't authorise the sync.",
      503,
    );
  }

  const { data, error } = await supabase
    .from("sales")
    .select("id, owner_wallet, price_stroops")
    .is("credited_at", null)
    .eq("status", "unclaimed")
    .order("created_at", { ascending: true })
    .limit(MAX_PER_SYNC);

  if (error) {
    return fail("Couldn't read the sales waiting to be credited.", 502);
  }

  const pending = (data ?? []) as PendingSale[];
  if (pending.length === 0) {
    return NextResponse.json({ credited: 0, batches: [], vault: await vault() });
  }

  const batches: { hash: string; count: number }[] = [];
  let credited = 0;

  for (let start = 0; start < pending.length; start += CREDIT_BATCH) {
    const slice = pending.slice(start, start + CREDIT_BATCH);
    try {
      const { hash, settled } = await creditBatch(secret, slice);
      const ids = settled.map((sale) => sale.id);

      const { error: markError } = await supabase
        .from("sales")
        .update({ credited_at: new Date().toISOString(), credit_tx: hash })
        .in("id", ids);

      if (markError) {
        // The ledger has it and our copy doesn't. Say so with the hash rather
        // than pretending the sync failed — a rerun reconciles it.
        return NextResponse.json(
          {
            credited,
            batches,
            warning: `Credited on-chain in ${hash}, but ${ids.length} sales couldn't be marked. Run the sync again.`,
            vault: await vault(),
          },
          { status: 200 },
        );
      }

      credited += ids.length;
      batches.push({ hash, count: ids.length });
    } catch (e) {
      const message =
        e instanceof PayoutError ? e.message : "The credit didn't go through.";
      // Batches before this one are already on the ledger and recorded; report
      // what landed rather than throwing the whole sync away.
      return NextResponse.json(
        { credited, batches, error: message, vault: await vault() },
        { status: credited > 0 ? 200 : 502 },
      );
    }
  }

  return NextResponse.json({ credited, batches, vault: await vault() });
}

/**
 * Credits one batch, and repairs the one drift that can happen: a batch that
 * reached the ledger while our copy of it did not. The contract refuses a sale
 * it has already seen, so on `AlreadyCredited` we ask which of these it knows
 * about, mark those as settled, and send only the rest.
 */
async function creditBatch(
  secret: string,
  sales: PendingSale[],
): Promise<{ hash: string; settled: PendingSale[] }> {
  const entries = (rows: PendingSale[]): CreditEntry[] =>
    rows.map((sale) => ({
      wallet: sale.owner_wallet,
      stroops: Number(sale.price_stroops),
      saleId: sale.id,
    }));

  try {
    return { hash: await creditSales(secret, entries(sales)), settled: sales };
  } catch (e) {
    if (!(e instanceof PayoutError) || !e.message.includes("already been credited")) {
      throw e;
    }

    const known = await Promise.all(sales.map((sale) => isCredited(sale.id)));
    const fresh = sales.filter((_, i) => !known[i]);
    if (fresh.length === 0) {
      // All of them were already on-chain; nothing to send, everything to mark.
      return { hash: "", settled: sales };
    }
    return { hash: await creditSales(secret, entries(fresh)), settled: sales };
  }
}

/** The vault as it stands after a sync, for the panel to render. */
async function vault() {
  return readVault().catch(() => null);
}
