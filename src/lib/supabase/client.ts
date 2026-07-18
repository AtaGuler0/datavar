import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client — the data plane for files and their metadata.
 * The anon key is public by design; row-level security is what actually
 * protects the tables. There's no Supabase Auth session here: identity is the
 * connected Stellar wallet, carried on each row as `owner_wallet`.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // No user sessions — the wallet is the identity, so don't let the client
    // try to persist or refresh a Supabase auth token that never exists.
    persistSession: false,
    autoRefreshToken: false,
  },
});

/** Storage bucket that holds the raw dataset files. Private; see schema SQL. */
export const DATASETS_BUCKET = "datasets";
