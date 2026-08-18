import { createClient } from "@supabase/supabase-js";
import { currentToken } from "@/lib/auth/session-store";

/**
 * Supabase client — the data plane for files and their metadata.
 *
 * Identity is still the connected Stellar wallet rather than a Supabase Auth
 * user, but it is no longer merely asserted: after the wallet signs a SEP-10
 * challenge the server mints a token carrying its address, and this client
 * sends that token on every request. Row-level security reads the address out
 * of it, so the database — not this code — decides which rows come back.
 *
 * Signed out, the token callback returns null and the client falls back to the
 * anon key, which now reaches only the public aggregate views. That is what the
 * landing page and the server render with, and it is all a stranger gets.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
  );
}

export const supabase = createClient(url, anonKey, {
  // Called before every request, so a session that arrives, expires or is
  // signed out takes effect on the next query without rebuilding the client.
  // On the server there is no browser session and this is always null.
  accessToken: async () => currentToken(),
});

/**
 * A client bound to one caller's session token, for server routes acting on
 * behalf of a contributor. The same row-level security applies to it as to the
 * browser — a route holding a session cannot reach further than the wallet
 * that session belongs to.
 */
export function supabaseForToken(token: string) {
  return createClient(url!, anonKey!, {
    accessToken: async () => token,
  });
}

/**
 * A client that mints a fresh token before each request instead of carrying
 * one. For a long-lived client on the server whose token would otherwise expire
 * under it — the rate limiter holds exactly one of these for the process.
 */
export function supabaseForMintedToken(token: () => string) {
  return createClient(url!, anonKey!, {
    accessToken: async () => token(),
  });
}

/** Storage bucket that holds the raw dataset files. Private; see schema SQL. */
export const DATASETS_BUCKET = "datasets";

/** Illustrations for blog posts. Public read, operator write, and the only
 *  bucket in the product where that is the right way round. */
export const POST_IMAGES_BUCKET = "post-images";
