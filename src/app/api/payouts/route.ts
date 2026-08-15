import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { AuthConfigError, issueToken } from "@/lib/auth/jwt";
import { readSession } from "@/lib/auth/session";
import { supabaseForToken } from "@/lib/supabase/client";
import {
  balanceOf,
  buildAddOperator,
  buildCredit,
  buildRemoveOperator,
  CREDIT_BATCH,
  isCredited,
  isPayoutConfigured,
  PayoutError,
  readAdmin,
  readOperators,
  readVault,
  submitToVault,
  type CreditEntry,
} from "@/lib/stellar/payout";

/**
 * The payout vault: what it holds, and putting sales into it.
 *
 * `GET` reads the contract and needs no session. That is deliberate — the vault
 * is the product's claim that contributor earnings are not ours to withhold,
 * and a claim nobody can check is not worth making. What it holds, what it owes
 * and who is allowed to touch it are public because they have to be.
 *
 * `POST` is the operator's, and writing sales into the vault is the only thing
 * it can ask the contract to do — the moment money stops being ours. It works
 * the way a claim works: this route prepares the call, the operator's own wallet
 * signs it, and this route relays the result and records it.
 *
 * That is a change worth naming. Crediting used to be signed here with a secret
 * in the environment, so the role belonged to the server: a deployment without
 * that secret could credit nothing, and a leaked server handed the role to
 * whoever took it. Now the contract names an address, an operator holds the key
 * to it in their own wallet, and this server holds no key at all. It cannot
 * credit, cannot claim, cannot pay, cannot withdraw. It reads the ledger, hands
 * over unsigned transactions, and keeps our copy of what happened.
 */

// stellar-sdk needs Node built-ins; the edge runtime can't carry it.
export const runtime = "nodejs";

/** Long enough to credit a round and record it. */
const OPERATOR_TTL_SECONDS = 300;

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
    const [vault, balance, operators, admin] = await Promise.all([
      readVault(),
      wallet ? balanceOf(wallet) : Promise.resolve(null),
      // Who may credit and who may hand that role out. Public for the same
      // reason the balances are: a vault whose rules you have to take our word
      // for is not meaningfully different from a database.
      readOperators().catch(() => null),
      readAdmin().catch(() => null),
    ]);
    return NextResponse.json({ vault, balance, roles: { operators, admin } });
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

  const wallet = session.wallet;
  if (!StrKey.isValidEd25519PublicKey(wallet)) {
    return fail("That session isn't for a Stellar address.", 400);
  }

  let body: {
    action?: unknown;
    xdr?: unknown;
    saleIds?: unknown;
    operator?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  try {
    if (body.action === "build") return await buildRound(wallet);

    if (body.action === "add-operator" || body.action === "remove-operator") {
      // Defaults to the caller, which is the common case: an admin giving
      // themselves the role on a deployment that has nobody in it yet.
      const target = body.operator === undefined ? wallet : body.operator;
      if (typeof target !== "string" || !StrKey.isValidEd25519PublicKey(target)) {
        return fail("That isn't a Stellar address.", 400);
      }
      return await buildRoleChange(wallet, target, body.action);
    }

    if (body.action === "submit") {
      if (typeof body.xdr !== "string" || !body.xdr) {
        return fail("A signed transaction is required.", 400);
      }
      const saleIds = readSaleIds(body.saleIds);
      if (saleIds === null) {
        return fail("That isn't a list of sales to record.", 400);
      }

      const hash = await submitToVault(body.xdr);
      // A role change carries no sales, and there is nothing to record for it:
      // the contract is the record.
      const recorded = saleIds.length
        ? await record(wallet, saleIds, hash)
        : { credited: 0 };
      return NextResponse.json({ hash, ...recorded, vault: await vault() });
    }

    return fail("Unknown action.", 400);
  } catch (e) {
    if (e instanceof PayoutError) return fail(e.message, 502);
    return fail("Couldn't reach the payout contract. Try again.", 502);
  }
}

/** Sale ids as the client may send them, or null if that isn't what arrived. */
function readSaleIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > CREDIT_BATCH) return null;
  if (!value.every((id) => typeof id === "string" && id.length > 0)) return null;
  return value as string[];
}

/**
 * Prepares one batch of sales for the operator to sign.
 *
 * One batch rather than the whole queue, because each batch is a signature and
 * a person is being asked for it — the client comes back for the next one while
 * `remaining` says there is more. The contract's ceiling is the real reason
 * batches exist at all.
 */
async function buildRound(wallet: string) {
  const operators = await readOperators();
  if (!operators.includes(wallet)) {
    return fail(
      operators.length === 0
        ? "The vault has no operators yet. Whoever holds the contract's admin key can add one from this panel."
        : `This wallet isn't one of the vault's operators. The contract credits for ${operators.join(", ")}. Sign in as one of those, or have the contract's admin add this wallet.`,
      403,
    );
  }

  const supabase = operatorClient(wallet);
  if (!supabase.client) return fail(supabase.error, 503);

  const { data, count, error } = await supabase.client
    .from("sales")
    .select("id, owner_wallet, price_stroops", { count: "exact" })
    .is("credited_at", null)
    .eq("status", "unclaimed")
    .order("created_at", { ascending: true })
    .limit(CREDIT_BATCH);

  if (error) {
    return fail("Couldn't read the sales waiting to be credited.", 502);
  }

  const pending = (data ?? []) as PendingSale[];
  if (pending.length === 0) {
    return NextResponse.json({ xdr: null, saleIds: [], remaining: 0 });
  }

  // Anything the contract has already seen would fail the whole batch, so it
  // leaves here as recorded rather than as a transaction that cannot land. This
  // is the drift a batch that reached the ledger while our copy didn't leaves
  // behind; a rerun repairs it without anyone signing anything.
  const known = await Promise.all(pending.map((sale) => isCredited(sale.id)));
  const stale = pending.filter((_, i) => known[i]);
  const fresh = pending.filter((_, i) => !known[i]);

  if (stale.length > 0) {
    await mark(
      supabase.client,
      stale.map((sale) => sale.id),
      "",
    );
  }
  if (fresh.length === 0) {
    return NextResponse.json({
      xdr: null,
      saleIds: [],
      remaining: Math.max((count ?? 0) - pending.length, 0),
      reconciled: stale.length,
    });
  }

  const entries: CreditEntry[] = fresh.map((sale) => ({
    wallet: sale.owner_wallet,
    stroops: Number(sale.price_stroops),
    saleId: sale.id,
  }));

  return NextResponse.json({
    xdr: await buildCredit(wallet, entries),
    saleIds: fresh.map((sale) => sale.id),
    stroops: entries.reduce((sum, entry) => sum + entry.stroops, 0),
    remaining: Math.max((count ?? 0) - pending.length, 0),
    reconciled: stale.length,
  });
}

/**
 * Prepares giving the operator role to a wallet, or taking it back. The
 * contract lets only its admin do either and checks that itself; the check here
 * is so the answer is a sentence rather than a failed simulation.
 */
async function buildRoleChange(
  wallet: string,
  target: string,
  action: "add-operator" | "remove-operator",
) {
  const [admin, operators] = await Promise.all([readAdmin(), readOperators()]);
  if (admin !== wallet) {
    return fail(
      `Only the contract's admin can change who credits, and that is ${admin}.`,
      403,
    );
  }

  const adding = action === "add-operator";
  if (adding && operators.includes(target)) {
    return fail("That wallet is already an operator.", 409);
  }
  if (!adding && !operators.includes(target)) {
    return fail("That wallet isn't an operator.", 409);
  }

  return NextResponse.json({
    xdr: adding
      ? await buildAddOperator(wallet, target)
      : await buildRemoveOperator(wallet, target),
  });
}

/**
 * Records what the ledger now says, against the sales it was signed for.
 *
 * The money has already moved by the time this runs, so a failure here is
 * reported rather than treated as a failed credit — the hash is the truth and
 * the row is our copy of it. Each sale is checked against the contract before
 * being marked: the ids arrive from the browser, and "credited" is a claim
 * about the ledger, so the ledger is what gets asked.
 */
async function record(
  wallet: string,
  saleIds: string[],
  hash: string,
): Promise<{ credited: number; warning?: string }> {
  const supabase = operatorClient(wallet);
  if (!supabase.client) {
    return { credited: 0, warning: `Credited in ${hash}, but ${supabase.error}` };
  }

  const known = await Promise.all(saleIds.map((id) => isCredited(id)));
  const landed = saleIds.filter((_, i) => known[i]);
  if (landed.length === 0) {
    return {
      credited: 0,
      warning: `Transaction ${hash} landed, but the contract doesn't hold these sales. Nothing was marked.`,
    };
  }

  const marked = await mark(supabase.client, landed, hash);
  if (!marked) {
    return {
      credited: 0,
      warning: `Credited on-chain in ${hash}, but ${landed.length} sales couldn't be marked. Run the sync again.`,
    };
  }

  return {
    credited: landed.length,
    warning:
      landed.length < saleIds.length
        ? `${saleIds.length - landed.length} of those sales aren't in the contract. Try them again.`
        : undefined,
  };
}

/** Writes the credit onto the rows. Empty hash for a sale reconciled after the
 *  fact, where the transaction that credited it is one we no longer have. */
async function mark(
  client: ReturnType<typeof supabaseForToken>,
  ids: string[],
  hash: string,
): Promise<boolean> {
  const { error } = await client
    .from("sales")
    .update({
      credited_at: new Date().toISOString(),
      ...(hash ? { credit_tx: hash } : {}),
    })
    .in("id", ids);
  return !error;
}

/**
 * An operator-scoped Supabase client, or the reason there isn't one.
 *
 * Deliberately not the caller's session token: this one exists to write rows the
 * operator policy allows, and it lives for five minutes.
 */
function operatorClient(wallet: string):
  | { client: ReturnType<typeof supabaseForToken>; error: null }
  | { client: null; error: string } {
  try {
    const { token } = issueToken({
      wallet,
      admin: true,
      ttlSeconds: OPERATOR_TTL_SECONDS,
    });
    return { client: supabaseForToken(token), error: null };
  } catch (e) {
    return {
      client: null,
      error:
        e instanceof AuthConfigError ? e.message : "the sync couldn't be authorised.",
    };
  }
}

/** The vault as it stands after a credit, for the panel to render. */
async function vault() {
  return readVault().catch(() => null);
}
