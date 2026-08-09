import { NextResponse } from "next/server";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { issueToken } from "@/lib/auth/jwt";
import { readSession } from "@/lib/auth/session";
import { supabaseForToken } from "@/lib/supabase/client";
import { CLEANUP_SQL, demoDataset, demoSale } from "@/lib/demo-data";

/**
 * Fills an empty deployment with plausible contributions, so the product can
 * be looked at rather than imagined.
 *
 * Two gates, both of which have to pass. It is operator-only, because it
 * writes rows on other wallets' behalf — which it can do at all only because
 * the server holds the signing secret, and is exactly the power that must
 * never be reachable from a browser without a signed operator session. And it
 * refuses to run in production unless someone deliberately turns it on, because
 * a live protocol whose numbers are partly invented is worse than an empty one.
 *
 * What it cannot do is grant consent. A receipt is signed by the contributor's
 * wallet against the contract, and no amount of server access substitutes for
 * that signature — which is the property the whole consent design exists to
 * have. Seeded datasets therefore sit at the consent step, which is also the
 * most honest thing for them to demonstrate.
 */

export const runtime = "nodejs";

/** Ceilings, so a typo in the request can't write thousands of rows. */
const MAX_CONTRIBUTORS = 40;
const MAX_DATASETS_PER = 8;
const MAX_TOTAL_DATASETS = 300;

/** Long enough to insert one wallet's rows. */
const TOKEN_TTL_SECONDS = 300;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function seedingAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_DEMO_SEED === "true"
  );
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(value)));

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session) return fail("Sign in with your wallet.", 401);
  if (!session.admin) return fail("Operators only.", 403);
  if (!seedingAllowed()) {
    return fail(
      "Seeding is off in production. Set ALLOW_DEMO_SEED=true to override.",
      403,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Zero is allowed: filling one named wallet without inventing a crowd around
  // it is a reasonable thing to want.
  const contributors = clamp(Number(body.contributors ?? 8), 0, MAX_CONTRIBUTORS);
  const perContributor = clamp(Number(body.datasetsPer ?? 3), 1, MAX_DATASETS_PER);
  const days = clamp(Number(body.days ?? 60), 1, 365);
  // Ratios, not counts: how much of what exists gets sold, and how much of
  // that has already been paid out.
  const soldRatio = Math.max(0, Math.min(1, Number(body.soldRatio ?? 0.45)));
  const claimedRatio = Math.max(0, Math.min(1, Number(body.claimedRatio ?? 0.5)));
  // Whether a named wallet gets a share, so a real dashboard fills up rather
  // than only invented ones. Defaults to the operator's own — but any address
  // can be named, which is how you fill the wallet you actually browse with
  // when that isn't the one you administer from.
  const includeSelf = body.includeSelf !== false;
  const named = typeof body.wallet === "string" ? body.wallet.trim() : "";
  if (named && !StrKey.isValidEd25519PublicKey(named)) {
    return fail("That isn't a Stellar address.", 400);
  }
  const target = named || session.wallet;

  if (contributors * perContributor > MAX_TOTAL_DATASETS) {
    return fail(
      `That's more than ${MAX_TOTAL_DATASETS} datasets. Lower the numbers.`,
      400,
    );
  }

  // Random Stellar addresses. No keys are kept: these wallets never sign
  // anything, because everything they "do" here is us writing their rows.
  const wallets = Array.from({ length: contributors }, () =>
    Keypair.random().publicKey(),
  );
  if (includeSelf) wallets.unshift(target);

  if (wallets.length === 0) {
    return fail("Nothing to seed: no contributors and no wallet named.", 400);
  }

  const created: { id: string; owner_wallet: string; created_at: string }[] = [];

  try {
    // One token per wallet: the datasets insert policy checks that the row's
    // owner is the caller, so seeding on someone's behalf means speaking as
    // them. The server can, because it holds the secret that mints sessions.
    for (const wallet of wallets) {
      const { token } = issueToken({
        wallet,
        admin: false,
        ttlSeconds: TOKEN_TTL_SECONDS,
      });
      const client = supabaseForToken(token);

      const rows = Array.from({ length: perContributor }, () =>
        demoDataset(wallet, days),
      );

      const { data, error } = await client
        .from("datasets")
        .insert(rows)
        .select("id, owner_wallet, created_at");

      if (error) throw new Error(error.message);
      created.push(...(data ?? []));
    }

    // Sales are an operator's own write, so one token covers all of them.
    const { token: operatorToken } = issueToken({
      wallet: session.wallet,
      admin: true,
      ttlSeconds: TOKEN_TTL_SECONDS,
    });
    const operator = supabaseForToken(operatorToken);

    const sold = created.filter(() => Math.random() < soldRatio);
    const sales = sold.map((dataset) =>
      demoSale(dataset, Math.random() < claimedRatio),
    );

    if (sales.length > 0) {
      const { error } = await operator.from("sales").insert(sales);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({
      contributors: wallets.length,
      datasets: created.length,
      sales: sales.length,
      claimed: sales.filter((s) => s.status === "claimed").length,
      cleanupSql: CLEANUP_SQL,
    });
  } catch (e) {
    return fail(
      e instanceof Error ? e.message : "Seeding failed part-way through.",
      502,
    );
  }
}
