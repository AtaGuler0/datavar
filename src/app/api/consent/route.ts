import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import {
  ConsentError,
  buildGrant,
  buildRevoke,
  isConsentConfigured,
  listReceipts,
} from "@/lib/stellar/consent";

/**
 * Reading and preparing consent receipts.
 *
 * `GET` needs no wallet and no authorisation — it simulates a view call against
 * the contract, which is the same thing a buyer would do to check a receipt
 * without asking us. That is not a gap in this route; it is the product's
 * central claim, working.
 *
 * `POST` only builds. It returns unsigned XDR, so nothing here can grant or
 * revoke on a contributor's behalf: the transaction is inert until their wallet
 * signs it, and it is their signature the contract checks, not this server's
 * word about who was calling.
 */

// stellar-sdk needs Node built-ins; the edge runtime can't carry it.
export const runtime = "nodejs";

/** SHA-256, lowercase hex — the digest the upload flow computes in the browser. */
const SHA256_HEX = /^[0-9a-f]{64}$/;
const MAX_PURPOSE_LEN = 200;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function handle(e: unknown) {
  if (e instanceof ConsentError) return fail(e.message, 502);
  return fail("Couldn't reach the consent contract. Try again.", 502);
}

export async function GET(request: Request) {
  if (!isConsentConfigured()) {
    return fail("The consent contract isn't configured on this deployment.", 503);
  }

  const wallet = new URL(request.url).searchParams.get("wallet");
  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return fail("A valid wallet address is required.", 400);
  }

  try {
    return NextResponse.json({ receipts: await listReceipts(wallet) });
  } catch (e) {
    return handle(e);
  }
}

export async function POST(request: Request) {
  if (!isConsentConfigured()) {
    return fail("The consent contract isn't configured on this deployment.", 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON body.", 400);
  }

  const contributor = str(body.contributor);
  if (!contributor || !StrKey.isValidEd25519PublicKey(contributor)) {
    return fail("A valid contributor address is required.", 400);
  }

  try {
    if (body.action === "revoke") {
      const receiptId = str(body.receiptId);
      if (!receiptId || !/^\d+$/.test(receiptId)) {
        return fail("A receipt id is required.", 400);
      }
      return NextResponse.json({
        xdr: await buildRevoke({ contributor, receiptId }),
      });
    }

    if (body.action === "grant") {
      const buyer = str(body.buyer);
      const datasetHash = str(body.datasetHash)?.toLowerCase();
      const purpose = str(body.purpose)?.trim();
      const expiresAt =
        typeof body.expiresAt === "number" ? Math.floor(body.expiresAt) : null;

      if (!buyer || !StrKey.isValidEd25519PublicKey(buyer)) {
        return fail("That isn't a Stellar address for the buyer.", 400);
      }
      if (!datasetHash || !SHA256_HEX.test(datasetHash)) {
        return fail("The dataset hash has to be a SHA-256 digest.", 400);
      }
      if (!purpose) {
        return fail("Say what the data may be used for.", 400);
      }
      if (purpose.length > MAX_PURPOSE_LEN) {
        return fail(`Keep the purpose under ${MAX_PURPOSE_LEN} characters.`, 400);
      }
      // The contract rejects this too — checking here just saves a round trip
      // and gives a better sentence than a contract error code.
      if (!expiresAt || expiresAt <= Math.floor(Date.now() / 1000)) {
        return fail("Consent has to end in the future.", 400);
      }

      return NextResponse.json({
        xdr: await buildGrant({
          contributor,
          buyer,
          datasetHash,
          purpose,
          expiresAt,
        }),
      });
    }

    return fail("Unknown action.", 400);
  } catch (e) {
    return handle(e);
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
