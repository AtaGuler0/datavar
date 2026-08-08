/**
 * Where the browser keeps its session token.
 *
 * The token is readable by scripts on the page, which is the same posture
 * Supabase Auth itself takes with its access token, and the same one the anon
 * key already has. What it buys is worth that: without it the database has no
 * way to tell one contributor from another, and every row is readable by
 * anyone holding the public key.
 *
 * Deliberately not a React hook. The Supabase client asks for the current token
 * on every request, from outside React, so the source of truth has to live
 * here and the provider subscribes to it.
 */

export type Session = {
  token: string;
  wallet: string;
  admin: boolean;
  /** Unix seconds. */
  expiresAt: number;
  /** True when the deployment has named no operators at all. */
  adminListEmpty: boolean;
};

const STORAGE_KEY = "datavar.session";

let current: Session | null = null;
let hydrated = false;
const listeners = new Set<(session: Session | null) => void>();

function expired(session: Session): boolean {
  return session.expiresAt <= Math.floor(Date.now() / 1000);
}

/**
 * Reads the stored session, once per page load. An expired or malformed one is
 * dropped rather than returned — a caller asking "am I signed in" should never
 * have to also ask "and is it still good".
 */
function hydrate(): Session | null {
  if (hydrated || typeof window === "undefined") return current;
  hydrated = true;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session?.token || !session.wallet || expired(session)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    current = session;
  } catch {
    current = null;
  }

  return current;
}

export function getSession(): Session | null {
  const session = hydrate();
  if (session && expired(session)) {
    clearSession();
    return null;
  }
  return session;
}

/**
 * The token, or null. This is what the Supabase client calls before every
 * query, so it stays synchronous work behind an async signature.
 */
export function currentToken(): string | null {
  return getSession()?.token ?? null;
}

export function setSession(session: Session): void {
  current = session;
  hydrated = true;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
  listeners.forEach((notify) => notify(session));
}

export function clearSession(): void {
  current = null;
  hydrated = true;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  listeners.forEach((notify) => notify(null));
}

export function subscribe(listener: (session: Session | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Authorization header for our own routes, or nothing when signed out. */
export function authHeaders(): Record<string, string> {
  const token = currentToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
