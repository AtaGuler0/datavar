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
 */

export type WalletStatus = "loading" | "disconnected" | "connecting" | "connected";

type WalletContextValue = {
  address: string | null;
  status: WalletStatus;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
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

  // Our picker's state: open/closed, the kit's wallet list, which wallet is
  // mid-handshake, and the last failure worth telling the user about.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wallets, setWallets] = useState<ISupportedWallet[] | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // Guards against a resolved promise calling setState after unmount.
  const mounted = useRef(true);

  // On load, restore a previously connected wallet. The kit persists the
  // address in localStorage, so getAddress resolves without reopening a modal.
  useEffect(() => {
    mounted.current = true;
    loadKit()
      .then((kit) => kit.getAddress())
      .then(({ address }) => {
        if (!mounted.current) return;
        setAddress(address);
        setStatus("connected");
      })
      .catch(() => {
        if (!mounted.current) return;
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
    } catch {
      // Rejected in the extension, or it never answered — stay open so the
      // user can retry or pick another wallet.
      if (mounted.current) {
        setPickerError(`${wallet.name} didn't connect. Try again or pick another wallet.`);
      }
    } finally {
      if (mounted.current) setConnectingId(null);
    }
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setConnectingId(null);
    setPickerError(null);
    setStatus(address ? "connected" : "disconnected");
  }, [address]);

  const disconnect = useCallback(async () => {
    const kit = await loadKit();
    await kit.disconnect();
    setAddress(null);
    setStatus("disconnected");
  }, []);

  return (
    <WalletContext.Provider value={{ address, status, connect, disconnect }}>
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
