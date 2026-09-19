"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ISupportedWallet } from "@creit.tech/stellar-wallets-kit";
import {
  googleSession,
  signOutGoogle,
  startGoogleSignIn,
} from "@/lib/auth/google-client";
import {
  clearSession,
  getSession,
  setSession,
  subscribe,
  type Session,
} from "@/lib/auth/session-store";
import { STELLAR } from "@/lib/stellar/config";
import { WalletPicker } from "./wallet-picker";

/**
 * A Stellar wallet is the identity in this product — a dataset is owned by an
 * address, a payout is addressed to one, a consent receipt names one. This
 * context owns that identity and hands the rest of the app a small, stable
 * surface.
 *
 * The kit is used headless: it supplies the wallet list and the connection,
 * while the picker UI is our own (wallet-picker.tsx) — the stock modal
 * neither matches the product nor belongs in its DOM. Loading the kit lazily
 * in the browser keeps this provider SSR-safe.
 *
 * Connecting and signing in are two different things, and the difference is
 * the whole point. Connecting only asks the wallet what address it holds,
 * which anyone can claim. Signing in makes it prove it: the server issues a
 * SEP-10 challenge, the wallet signs it, and what comes back is a session the
 * database will honour. Nothing that reads a contributor's own rows works
 * without one, because row-level security refuses — which is the intended
 * outcome, not a wrinkle to route around.
 *
 * Google sign-in is a third state layered on those two, and it is deliberately
 * the weakest of them. A Google account that has been attached to a wallet can
 * be traded for the same session token a signature produces, which is what
 * makes the second visit a click. It cannot produce a signature, because we
 * hold no key: `canSign` is false until a wallet is actually connected here,
 * and everything that moves money reads it.
 */

export type WalletStatus =
  | "loading"
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "connected";

/** The Google account signed in on this browser, and whether it reaches a wallet. */
export type GoogleAccount = {
  email: string;
  /** False when no wallet has been attached to it yet. */
  linked: boolean;
};

type WalletContextValue = {
  /**
   * Who you are: the connected wallet's address, or — when the session came
   * from Google and no extension is attached — the wallet that session belongs
   * to. Everything that reads your own rows wants this one.
   */
  address: string | null;
  status: WalletStatus;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /**
   * The proved session, or null while the wallet is merely connected. Its
   * token is what the Supabase client and our own routes are shown.
   */
  session: Session | null;
  /** Runs the SEP-10 handshake. Called automatically after connecting, and by
   *  hand when a session has expired. */
  signIn: () => Promise<void>;
  /** Why the last sign-in attempt didn't produce a session. */
  signInError: string | null;
  /**
   * Whether a wallet is attached to this browser right now.
   *
   * Separate from `address` because signed in and able to sign stopped being
   * the same thing the moment Google sign-in existed. Anything that asks for a
   * signature — granting consent, funding a purchase, claiming a payout —
   * checks this first and asks for a wallet rather than failing at the prompt.
   */
  canSign: boolean;
  /** The Google account on this browser, if any. */
  google: GoogleAccount | null;
  googleError: string | null;
  /** Sends the browser to Google and returns to the page it left. */
  signInWithGoogle: () => Promise<void>;
  /** Attaches the signed-in Google account to the signed-in wallet. */
  linkGoogle: () => Promise<void>;
  /** Detaches it. The wallet keeps everything it owned. */
  unlinkGoogle: () => Promise<void>;
  /**
   * Hands unsigned XDR to the connected wallet and returns what comes back
   * signed. The only path by which anything in this product is authorised by a
   * contributor — the key stays in their extension, and the server never sees
   * a transaction it could have signed itself.
   */
  signTransaction: (xdr: string) => Promise<string>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

// The kit is a static singleton; init it once per page load, in the browser.
let kitPromise: Promise<typeof import("@creit.tech/stellar-wallets-kit").StellarWalletsKit> | null =
  null;

function loadKit() {
  if (!kitPromise) {
    kitPromise = (async () => {
      // Module classes ship on their own subpaths; only the kit and enums
      // live on the package root.
      const [
        { StellarWalletsKit, Networks },
        { FreighterModule },
        { xBullModule },
        { AlbedoModule },
        { LobstrModule },
      ] = await Promise.all([
        import("@creit.tech/stellar-wallets-kit"),
        import("@creit.tech/stellar-wallets-kit/modules/freighter"),
        import("@creit.tech/stellar-wallets-kit/modules/xbull"),
        import("@creit.tech/stellar-wallets-kit/modules/albedo"),
        import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
      ]);

      StellarWalletsKit.init({
        network: Networks.TESTNET,
        modules: [
          new FreighterModule(),
          new xBullModule(),
          new AlbedoModule(),
          new LobstrModule(),
        ],
      });

      return StellarWalletsKit;
    })();
  }
  return kitPromise;
}

/**
 * How much of a session has to be left for it to be worth keeping as it is.
 *
 * Under half, the browser asks for a new one on the way in. Above it, a
 * refresh on every page load would be a request that changes nothing.
 */
const REFRESH_BELOW_SECONDS = 6 * 60 * 60;

/**
 * Restarts the clock on a session that is still good.
 *
 * Quiet on every failure, and deliberately so: the session in hand still works
 * until it expires, and a refresh that could not happen is not something to
 * put in front of somebody. They will be asked to sign when it runs out, which
 * is what would have happened anyway.
 */
async function refreshSession(current: Session): Promise<void> {
  const left = current.expiresAt - Math.floor(Date.now() / 1000);
  if (left > REFRESH_BELOW_SECONDS) return;

  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${current.token}` },
    });
    if (!response.ok) return;
    const result = await response.json();
    setSession({
      token: result.token,
      wallet: result.wallet,
      admin: result.admin,
      expiresAt: result.expiresAt,
      adminListEmpty: result.adminListEmpty,
    });
  } catch {
    // Offline, or the route is not there. The stored session is untouched.
  }
}

/**
 * Attaches whatever Google account is signed in here to the wallet that just
 * proved itself. Quiet by design: this runs on the way out of a signature the
 * person asked for, and a link that could not be made is not a reason to tell
 * them their sign-in failed. It didn't.
 */
async function attachGoogle(token: string): Promise<GoogleAccount | null> {
  const google = await googleSession();
  if (!google) return null;

  const response = await fetch("/api/auth/link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ token: google.accessToken }),
  });
  const result = await response.json().catch(() => null);

  return {
    email: result?.email ?? google.email ?? "",
    linked: response.ok,
  };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  // The wallet the extension says is connected. Null under a Google session
  // with no extension attached, which is why the context exposes something
  // else as `address`.
  const [kitAddress, setKitAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("loading");
  const [session, setSessionState] = useState<Session | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [google, setGoogle] = useState<GoogleAccount | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Our picker's state: open/closed, the kit's wallet list, which wallet is
  // mid-handshake, and the last failure worth telling the user about.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wallets, setWallets] = useState<ISupportedWallet[] | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // Guards against a resolved promise calling setState after unmount.
  const mounted = useRef(true);

  // The store is the source of truth for the token — the Supabase client reads
  // it from outside React — so mirror it into state rather than duplicating it.
  useEffect(() => subscribe(setSessionState), []);

  // On load, work out who is here, in the order that can only be done that
  // way: the wallet first, because a connected wallet that disagrees with the
  // stored session settles it, then Google, because trading a Google session
  // for one of ours is pointless if we already hold one.
  //
  // A stored session with no wallet attached is kept rather than dropped,
  // which it used to be. That was right when a session could only come from an
  // extension; now it can come from a Google account on a phone with no
  // extension at all, and dropping it would sign those people out on every
  // reload.
  useEffect(() => {
    mounted.current = true;

    (async () => {
      let connected: string | null = null;
      try {
        const { address } = await loadKit().then((kit) => kit.getAddress());
        connected = address || null;
      } catch {
        connected = null;
      }
      if (!mounted.current) return;

      // A switched account has to prove itself again.
      const stored = getSession();
      if (stored && connected && stored.wallet !== connected) {
        clearSession();
      } else if (stored) {
        // Still theirs, and still good. Restart its clock rather than let it
        // run out under somebody who is here every day — signing in once
        // should mean signing in once.
        void refreshSession(stored);
      }
      setKitAddress(connected);

      const account = await googleSession();
      if (!mounted.current) return;

      if (!account) {
        setStatus(connected || getSession() ? "connected" : "disconnected");
        return;
      }

      // Already holding a session: nothing to trade for, and whether that
      // account is attached is a question for the account panel, not sign-in.
      if (getSession()) {
        setGoogle({ email: account.email ?? "", linked: true });
        setStatus("connected");
        return;
      }

      setStatus("authenticating");
      try {
        const response = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: account.accessToken }),
        });
        const result = await response.json();
        if (!mounted.current) return;

        if (response.ok) {
          setSession({
            token: result.token,
            wallet: result.wallet,
            admin: result.admin,
            expiresAt: result.expiresAt,
            adminListEmpty: result.adminListEmpty,
          });
          setGoogle({ email: result.email ?? account.email ?? "", linked: true });
        } else {
          // 404 is the ordinary first-time answer: signed in with Google,
          // no wallet attached yet. The gate asks for one.
          setGoogle({ email: account.email ?? "", linked: false });
          if (response.status !== 404) {
            setGoogleError(result?.error ?? "Couldn't finish signing in.");
          }
        }
      } catch {
        if (mounted.current) {
          setGoogleError("Couldn't reach sign-in. Check your connection.");
        }
      } finally {
        if (mounted.current) {
          setStatus(connected || getSession() ? "connected" : "disconnected");
        }
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, []);

  // Opens the sign-in sheet and fills it with the kit's wallet list.
  // Availability is re-checked on every open — the user may have just
  // installed one. Named `connect` because a wallet is still what it leads to;
  // every button that calls it says "Sign in", because that is what a person
  // opening it is trying to do.
  const connect = useCallback(async () => {
    setStatus("connecting");
    setPickerError(null);
    setPickerOpen(true);
    try {
      const kit = await loadKit();
      const list = await kit.refreshSupportedWallets();
      if (mounted.current) setWallets(list);
    } catch {
      if (mounted.current) {
        setPickerError("Couldn't load wallet options. Close this and retry.");
      }
    }
  }, []);

  /**
   * The SEP-10 handshake: fetch a challenge for this address, have the wallet
   * sign it, hand it back. What returns is a token carrying an address the
   * server watched get proved, rather than one the browser asserted.
   */
  const authenticate = useCallback(async (target: string) => {
    setStatus("authenticating");
    setSignInError(null);
    try {
      const issued = await fetch(
        `/api/auth/challenge?wallet=${encodeURIComponent(target)}`,
      );
      const challenge = await issued.json();
      if (!issued.ok) {
        throw new Error(challenge?.error ?? "Couldn't start sign-in.");
      }

      const kit = await loadKit();
      const { signedTxXdr } = await kit.signTransaction(challenge.challenge, {
        address: target,
        networkPassphrase: challenge.networkPassphrase,
      });

      const created = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: signedTxXdr }),
      });
      const result = await created.json();
      if (!created.ok) {
        throw new Error(result?.error ?? "Sign-in didn't complete.");
      }

      setSession({
        token: result.token,
        wallet: result.wallet,
        admin: result.admin,
        expiresAt: result.expiresAt,
        adminListEmpty: result.adminListEmpty,
      });

      // If they arrived through Google and were sent here for a signature,
      // this is the moment the two halves become one account.
      const attached = await attachGoogle(result.token);
      if (attached && mounted.current) setGoogle(attached);
    } catch (e) {
      if (!mounted.current) return;
      // Declining the signature is a decision, not a failure.
      const message = e instanceof Error ? e.message : "";
      setSignInError(
        /reject|denied|declin|cancel/i.test(message)
          ? "You declined the signature, so you're connected but not signed in."
          : message || "Sign-in didn't complete.",
      );
    } finally {
      if (mounted.current) setStatus("connected");
    }
  }, []);

  const signIn = useCallback(async () => {
    if (kitAddress) await authenticate(kitAddress);
  }, [kitAddress, authenticate]);

  // The actual handshake, once a wallet is picked in our UI.
  const choose = useCallback(async (wallet: ISupportedWallet) => {
    setConnectingId(wallet.id);
    setPickerError(null);
    try {
      const kit = await loadKit();
      kit.setWallet(wallet.id);
      const { address } = await kit.fetchAddress();
      if (!mounted.current) return;
      setKitAddress(address);
      setStatus("connected");
      setPickerOpen(false);
      // Straight into signing in: connecting on its own reaches nothing, so
      // stopping here would only mean a second click to reach the same place.
      await authenticate(address);
    } catch {
      // Rejected in the extension, or it never answered — stay open so the
      // user can retry or pick another wallet.
      if (mounted.current) {
        setPickerError(`${wallet.name} didn't connect. Try again or pick another wallet.`);
      }
    } finally {
      if (mounted.current) setConnectingId(null);
    }
  }, [authenticate]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setConnectingId(null);
    setPickerError(null);
    setStatus(kitAddress || getSession() ? "connected" : "disconnected");
  }, [kitAddress]);

  // Signing out means signing out of both. A Google session left behind would
  // quietly sign them back in on the next reload, which is not what anybody
  // means by this button.
  const disconnect = useCallback(async () => {
    const kit = await loadKit();
    await kit.disconnect();
    await signOutGoogle();
    clearSession();
    setKitAddress(null);
    setGoogle(null);
    setGoogleError(null);
    setSignInError(null);
    setStatus("disconnected");
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setGoogleError(null);
    try {
      // Back to the page they are on, so signing in never also navigates.
      await startGoogleSignIn(
        `${window.location.pathname}${window.location.search}`,
      );
    } catch {
      if (mounted.current) {
        setGoogleError("Couldn't reach Google. Try again.");
      }
    }
  }, []);

  const linkGoogle = useCallback(async () => {
    setGoogleError(null);
    const current = getSession();
    if (!current) {
      setGoogleError("Sign in with your wallet first.");
      return;
    }

    const account = await googleSession();
    if (!account) {
      // No Google session here yet: this button is the start of one, and the
      // link happens on the way back through the signature.
      await signInWithGoogle();
      return;
    }

    const response = await fetch("/api/auth/link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${current.token}`,
      },
      body: JSON.stringify({ token: account.accessToken }),
    });
    const result = await response.json().catch(() => null);
    if (!mounted.current) return;

    if (!response.ok) {
      setGoogleError(result?.error ?? "Couldn't attach that account.");
      return;
    }
    setGoogle({ email: result?.email ?? account.email ?? "", linked: true });
  }, [signInWithGoogle]);

  const unlinkGoogle = useCallback(async () => {
    setGoogleError(null);
    const current = getSession();
    if (!current) return;

    const response = await fetch("/api/auth/link", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${current.token}` },
    });
    if (!mounted.current) return;

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      setGoogleError(result?.error ?? "Couldn't detach that account.");
      return;
    }

    await signOutGoogle();
    if (mounted.current) setGoogle(null);
  }, []);

  const signTransaction = useCallback(
    async (xdr: string) => {
      if (!kitAddress) {
        // Reachable under a Google session, and the sentence has to say which
        // of the two things missing it is: they are signed in.
        throw new Error(
          "Connect your Stellar wallet to sign this. Signing in with Google doesn't give us a key, and it never will.",
        );
      }
      const kit = await loadKit();
      const { signedTxXdr } = await kit.signTransaction(xdr, {
        address: kitAddress,
        networkPassphrase: STELLAR.networkPassphrase,
      });
      return signedTxXdr;
    },
    [kitAddress],
  );

  return (
    <WalletContext.Provider
      value={{
        address: kitAddress ?? session?.wallet ?? null,
        status,
        connect,
        disconnect,
        signTransaction,
        session,
        signIn,
        signInError,
        canSign: kitAddress !== null,
        google,
        googleError,
        signInWithGoogle,
        linkGoogle,
        unlinkGoogle,
      }}
    >
      {children}
      {pickerOpen && (
        <WalletPicker
          wallets={wallets}
          connectingId={connectingId}
          error={pickerError}
          google={google}
          onChoose={choose}
          onGoogle={signInWithGoogle}
          onClose={closePicker}
        />
      )}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return ctx;
}
