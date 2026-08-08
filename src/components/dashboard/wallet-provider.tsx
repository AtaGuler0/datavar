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
  clearSession,
  getSession,
  setSession,
  subscribe,
  type Session,
} from "@/lib/auth/session-store";
import { STELLAR } from "@/lib/stellar/config";
import { WalletPicker } from "./wallet-picker";

/**
 * A connected Stellar wallet is the contributor's identity — there's no email
 * or password anywhere in the product. This context owns that connection and
 * hands the rest of the dashboard a small, stable surface.
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
 */

export type WalletStatus =
  | "loading"
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "connected";

type WalletContextValue = {
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

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("loading");
  const [session, setSessionState] = useState<Session | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);

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

  // On load, restore a previously connected wallet. The kit persists the
  // address in localStorage, so getAddress resolves without reopening a modal.
  // A stored session survives the reload too, so the common case is no wallet
  // prompt at all; one belonging to a different address is dropped, because a
  // switched account must prove itself again.
  useEffect(() => {
    mounted.current = true;
    loadKit()
      .then((kit) => kit.getAddress())
      .then(({ address }) => {
        if (!mounted.current) return;
        const stored = getSession();
        if (stored && stored.wallet !== address) {
          clearSession();
        } else if (stored) {
          setSessionState(stored);
        }
        setAddress(address);
        setStatus("connected");
      })
      .catch(() => {
        if (!mounted.current) return;
        clearSession();
        setStatus("disconnected");
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  // Opens our picker and fills it with the kit's wallet list. Availability
  // is re-checked on every open — the user may have just installed one.
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
    if (address) await authenticate(address);
  }, [address, authenticate]);

  // The actual handshake, once a wallet is picked in our UI.
  const choose = useCallback(async (wallet: ISupportedWallet) => {
    setConnectingId(wallet.id);
    setPickerError(null);
    try {
      const kit = await loadKit();
      kit.setWallet(wallet.id);
      const { address } = await kit.fetchAddress();
      if (!mounted.current) return;
      setAddress(address);
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
    setStatus(address ? "connected" : "disconnected");
  }, [address]);

  const disconnect = useCallback(async () => {
    const kit = await loadKit();
    await kit.disconnect();
    clearSession();
    setAddress(null);
    setSignInError(null);
    setStatus("disconnected");
  }, []);

  const signTransaction = useCallback(
    async (xdr: string) => {
      if (!address) throw new Error("Connect a wallet first.");
      const kit = await loadKit();
      const { signedTxXdr } = await kit.signTransaction(xdr, {
        address,
        networkPassphrase: STELLAR.networkPassphrase,
      });
      return signedTxXdr;
    },
    [address],
  );

  return (
    <WalletContext.Provider
      value={{
        address,
        status,
        connect,
        disconnect,
        signTransaction,
        session,
        signIn,
        signInError,
      }}
    >
      {children}
      {pickerOpen && (
        <WalletPicker
          wallets={wallets}
          connectingId={connectingId}
          error={pickerError}
          onChoose={choose}
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
