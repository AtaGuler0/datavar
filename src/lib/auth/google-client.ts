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
 * Our own Google OAuth client id. Public by nature: it is in every sign-in URL.
 *
 * When it is set, the browser goes to Google directly and Google sends it back
 * to our /auth/callback with an ID token, which Supabase Auth then accepts
 * through `signInWithIdToken`. Google's account chooser then names our domain.
 * Without it, sign-in goes through Supabase's own OAuth endpoint as before,
 * and the chooser names the Supabase project's domain instead.
 */
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/** What the callback needs to finish a direct sign-in, kept for one round trip. */
const PENDING_KEY = "datavar.google.pending";

type Pending = { state: string; nonce: string; next: string };

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Sends the browser to Google. Nothing after this line runs — the page is
 * replaced — and what comes back lands on /auth/callback.
 */
export async function startGoogleSignIn(next: string): Promise<void> {
  markGoogleIntent();

  if (GOOGLE_CLIENT_ID) {
    // `state` ties the answer to this tab's request; `nonce` ties the ID token
    // to it. Google gets the nonce's hash and Supabase gets the nonce itself,
    // which is how Supabase checks the two match.
    const pending: Pending = {
      state: randomHex(16),
      nonce: randomHex(32),
      next,
    };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: `${window.location.origin}/auth/callback`,
      response_type: "id_token",
      response_mode: "fragment",
      scope: "openid email profile",
      state: pending.state,
      nonce: await sha256Hex(pending.nonce),
      prompt: "select_account",
    });
    window.location.assign(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    );
    return;
  }

  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await authClient().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
}

/**
 * Whether the person started a Google sign-in in this tab. A Google session
 * is only attached to a wallet when they did: one left in local storage by
 * somebody else on a shared browser must not be linked to whoever signs in
 * with a wallet next. Kept in sessionStorage so it survives the OAuth
 * redirect but not a closed tab.
 */
const INTENT_KEY = "datavar.google.intent";

function markGoogleIntent(): void {
  try {
    sessionStorage.setItem(INTENT_KEY, "1");
  } catch {
    // Storage blocked: no attach, which is the safe way to be wrong.
  }
}

/** True once per deliberate Google sign-in, then cleared. */
export function takeGoogleIntent(): boolean {
  try {
    const intended = sessionStorage.getItem(INTENT_KEY) === "1";
    sessionStorage.removeItem(INTENT_KEY);
    return intended;
  } catch {
    return false;
  }
}

/**
 * Finishes a direct Google sign-in on /auth/callback.
 *
 * Returns null when this page load isn't the end of one (the old Supabase
 * flow, or someone opening the callback by hand), the path to go back to when
 * it succeeded, and throws when Google refused or the answer doesn't match
 * what this tab asked for.
 *
 * Has to run before anything creates the Supabase auth client: that client
 * reads the URL when it starts, and the ID token is for us, not for it. The
 * fragment is cleared first for the same reason, and so the token doesn't
 * stay in the address bar or the history.
 */
let completion: Promise<string | null> | null = null;

export function completeGoogleRedirect(): Promise<string | null> {
  // Once per page load. React runs effects twice in development, and the
  // second run would find the fragment already gone and miss the sign-in.
  completion ??= finishGoogleRedirect();
  return completion;
}

async function finishGoogleRedirect(): Promise<string | null> {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const idToken = fragment.get("id_token");
  const error = fragment.get("error");
  if (!idToken && !error) return null;

  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );

  let pending: Pending | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
  } catch {
    pending = null;
  }
  sessionStorage.removeItem(PENDING_KEY);

  if (error) throw new Error(error);
  if (!pending || fragment.get("state") !== pending.state) {
    throw new Error("That sign-in wasn't started from this tab.");
  }

  const { error: signInError } = await authClient().auth.signInWithIdToken({
    provider: "google",
    token: idToken!,
    nonce: pending.nonce,
  });
  if (signInError) throw signInError;

  return pending.next;
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
