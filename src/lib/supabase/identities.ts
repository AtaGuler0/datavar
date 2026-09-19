import { issueToken } from "@/lib/auth/jwt";
import { supabaseForToken } from "./client";

/**
 * The Google-account-to-wallet link, from the server.
 *
 * Only the sign-in routes reach this table, and only after they have checked
 * a proof — which is why every client here is minted rather than passed in.
 * See `identities` in schema.sql for the policies these tokens are shaped to
 * satisfy.
 */

export type Identity = {
  user_id: string;
  wallet: string;
  email: string | null;
  provider: string;
  created_at: string;
  linked_at: string;
};

/** Long enough for one round trip, and useless for anything else. */
const TOKEN_TTL_SECONDS = 60;

/**
 * A client that may look the link up and nothing else.
 *
 * The empty wallet is the point rather than a placeholder: `current_wallet()`
 * reads it as null, and every write policy on the table demands that the row's
 * wallet equals it. So this token can read the table and cannot touch it,
 * enforced by the database rather than by this file remembering.
 */
function reader() {
  const { token } = issueToken({
    wallet: "",
    admin: false,
    ttlSeconds: TOKEN_TTL_SECONDS,
    link: true,
  });
  return supabaseForToken(token);
}

/** A client that may write the link for exactly one wallet. */
function writer(wallet: string) {
  const { token } = issueToken({
    wallet,
    admin: false,
    ttlSeconds: TOKEN_TTL_SECONDS,
    link: true,
  });
  return supabaseForToken(token);
}

export async function identityByUser(userId: string): Promise<Identity | null> {
  const { data, error } = await reader()
    .from("identities")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as Identity) ?? null;
}

export async function identityByWallet(
  wallet: string,
): Promise<Identity | null> {
  const { data, error } = await reader()
    .from("identities")
    .select("*")
    .eq("wallet", wallet)
    .maybeSingle();

  if (error) throw error;
  return (data as Identity) ?? null;
}

/**
 * Records that this account and this wallet belong together.
 *
 * Upserted on the account rather than the wallet, so signing in with the same
 * Google account and a different wallet moves the link instead of failing.
 * Moving it *onto* a wallet somebody else has linked is a different matter and
 * the unique index refuses it — the caller turns that into a sentence.
 */
export async function linkIdentity(input: {
  userId: string;
  wallet: string;
  email: string | null;
  provider: string;
}): Promise<Identity> {
  const { data, error } = await writer(input.wallet)
    .from("identities")
    .upsert(
      {
        user_id: input.userId,
        wallet: input.wallet,
        email: input.email,
        provider: input.provider,
        linked_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return data as Identity;
}

/** Keeps the shown address current when somebody changes it at Google. */
export async function refreshIdentityEmail(
  identity: Identity,
  email: string | null,
): Promise<void> {
  if (email === identity.email) return;
  const { error } = await writer(identity.wallet)
    .from("identities")
    .update({ email })
    .eq("user_id", identity.user_id);
  if (error) throw error;
}

/** Detaches the account from this wallet. The wallet keeps everything. */
export async function unlinkIdentity(wallet: string): Promise<void> {
  const { error } = await writer(wallet)
    .from("identities")
    .delete()
    .eq("wallet", wallet);
  if (error) throw error;
}

/** Postgres's unique-violation code, for the one collision worth a sentence. */
export const UNIQUE_VIOLATION = "23505";
