import { NextResponse } from "next/server";
import { Keypair, StrKey, WebAuth } from "@stellar/stellar-sdk";
import { STELLAR } from "@/lib/stellar/config";
import { CHALLENGE_TIMEOUT_SECONDS, authDomain } from "../shared";

/**
 * Step one of proving a wallet: hand out a challenge for it to sign.
 *
 * This is SEP-10, the ecosystem's own web-auth flow, rather than a signed
 * string of our invention. Two reasons. Every Stellar wallet already
 * implements `signTransaction`, while message signing varies between them. And
 * the challenge is a transaction built on sequence number 0, which no network
 * will ever accept — so a contributor signing in cannot be tricked into
 * signing away anything.
 *
 * The challenge carries a random nonce and 5-minute time bounds, and is signed
 * by our own key so step two can tell a challenge we issued from one somebody
 * made up.
 */

// stellar-sdk needs Node built-ins; the edge runtime can't carry it.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.STELLAR_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Wallet sign-in isn't configured. Set STELLAR_AUTH_SECRET on the server.",
      },
      { status: 503 },
    );
  }

  const wallet = new URL(request.url).searchParams.get("wallet");
  if (!wallet || !StrKey.isValidEd25519PublicKey(wallet)) {
    return NextResponse.json(
      { error: "A valid wallet address is required." },
      { status: 400 },
    );
  }

  const domain = authDomain(request);

  try {
    const challenge = WebAuth.buildChallengeTx(
      Keypair.fromSecret(secret),
      wallet,
      domain,
      CHALLENGE_TIMEOUT_SECONDS,
      STELLAR.networkPassphrase,
      domain,
    );
    return NextResponse.json({
      challenge,
      networkPassphrase: STELLAR.networkPassphrase,
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't build a sign-in challenge." },
      { status: 500 },
    );
  }
}
