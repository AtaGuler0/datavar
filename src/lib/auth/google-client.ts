import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Google sign-in, in the browser.
 *
 * A second Supabase client, and it has to be a second one: the client in
 * lib/supabase/client.ts is built with the `accessToken` option so that our own
 * session token drives row-level security, and supabase-js answers every call
 * to `supabase.auth` on such a client by throwing. The two never overlap —
 * this one only ever talks to Supabase Auth, and it stores its session under
 * its own key so neither can trample the other.
 *
 * What comes out of here is a Google session, which is not a session in this
 * product. It is evidence to hand to /api/auth/google, which looks up the
 * wallet it was attached to and mints the real one. Everything downstream —
 * every query, every policy — still runs on a token carrying a wallet.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

function authClient(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Missing Supabase env for sign-in.");
  }
  client ??= createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Reads the `?code=` Google sends back and trades it for a session, so
      // the callback page only has to wait rather than do anything.
      detectSessionInUrl: true,
      flowType: "pkce",
      storageKey: "datavar.google",
    },
  });
  return client;
}

export type GoogleSession = {
  /** The Supabase Auth access token. Only /api/auth/* is ever shown it. */
  accessToken: string;
  email: string | null;
};

/**
 * Sends the browser to Google. Nothing after this line runs — the page is
 * replaced — and what comes back lands on /auth/callback.
 */
export async function startGoogleSignIn(next: string): Promise<void> {
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await authClient().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
}

/** The stored Google session, refreshed if it needed it. Null when signed out. */
export async function googleSession(): Promise<GoogleSession | null> {
  if (typeof window === "undefined") return null;
  try {
    const { data, error } = await authClient().auth.getSession();
    if (error || !data.session) return null;
    return {
      accessToken: data.session.access_token,
      email: data.session.user.email ?? null,
    };
  } catch {
    // A missing env or a corrupt stored session is "not signed in with
    // Google", which is a state the rest of the product already handles.
    return null;
  }
}

export async function signOutGoogle(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await authClient().auth.signOut();
  } catch {
    // Already gone, or never configured. Either way there is no session left.
  }
}
