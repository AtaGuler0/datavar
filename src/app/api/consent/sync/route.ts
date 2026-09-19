import { NextResponse } from "next/server";
import { issueToken } from "@/lib/auth/jwt";
import { readSession } from "@/lib/auth/session";
import { mirrorReceipts } from "@/lib/consent-mirror";
import { logFailure } from "@/lib/log";
import { isConsentConfigured } from "@/lib/stellar/consent";
import { supabaseForToken } from "@/lib/supabase/client";

/**
 * Filling in the consent mirror for receipts granted before it existed.
 *
 * Every grant from here on mirrors itself as it lands (see ../submit), so this
 * is a backfill and not a job: an operator runs it once against a deployment
 * that already has receipts on-chain, and again whenever they want to be sure
 * the two agree. It reads the contract and writes what it says — there is no
 * input to this beyond how many contributors to walk.
 *
 * Batched by contributor, because each one is at least one simulation and a
 * walk of 131 of them is a minute of round trips. The response says where it
 * stopped; the caller passes that back as `offset` to carry on.
 */

// stellar-sdk needs Node built-ins; the edge runtime can't carry it.
export const runtime = "nodejs";

/** Contributors walked in one call. Small enough to finish inside a request. */
const DEFAULT_BATCH = 20;
const MAX_BATCH = 50;

/** Ceiling on the wallet list pulled in to walk. Same posture as the ledger. */
const MAX_CONTRIBUTORS = 5_000;

const OPERATOR_TTL_SECONDS = 300;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session?.admin) {
    return fail("Only an operator can sync the consent mirror.", 403);
  }
  if (!isConsentConfigured()) {
    return fail("The consent contract isn't configured on this deployment.", 503);
  }

  let body: { offset?: unknown; limit?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // An empty body means "start at the beginning", which is the common case.
  }

  const offset = Math.max(0, Number(body.offset ?? 0) || 0);
  const limit = Math.min(
    MAX_BATCH,
    Math.max(1, Number(body.limit ?? DEFAULT_BATCH) || DEFAULT_BATCH),
  );

  const { token } = issueToken({
    wallet: session.wallet,
    admin: true,
    ttlSeconds: OPERATOR_TTL_SECONDS,
  });

  const { data, error } = await supabaseForToken(token)
    .from("datasets")
    .select("owner_wallet")
    .order("owner_wallet", { ascending: true })
    .limit(MAX_CONTRIBUTORS);

  if (error) {
    logFailure("consent sync contributors", error);
    return fail("Couldn't read the contributor list.", 502);
  }

  // PostgREST has no `distinct`, and the column is indexed and small, so the
  // deduplication happens here rather than in a view built for one backfill.
  const wallets = Array.from(
    new Set((data ?? []).map((row) => row.owner_wallet as string)),
  ).sort();

  const batch = wallets.slice(offset, offset + limit);
  let receipts = 0;
  const failures: string[] = [];

  for (const wallet of batch) {
    try {
      receipts += await mirrorReceipts(wallet);
    } catch (e) {
      logFailure(`consent sync ${wallet}`, e);
      failures.push(wallet);
    }
  }

  const next = offset + batch.length;
  return NextResponse.json({
    contributors: wallets.length,
    walked: batch.length,
    receipts,
    failed: failures.length,
    next: next < wallets.length ? next : null,
  });
}
