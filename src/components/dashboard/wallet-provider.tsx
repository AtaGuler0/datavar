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

/**
 * A connected Stellar wallet is the contributor's identity — there's no email
 * or password anywhere in the product. This context owns that connection and
 * hands the rest of the dashboard a small, stable surface.
 *
 * The wallet kit is loaded lazily in the browser only: it renders its own
 * modal and reads localStorage at import time, neither of which belongs on the
 * server. That import is also what keeps this provider SSR-safe.
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

  const connect = useCallback(async () => {
    setStatus("connecting");
    try {
      const kit = await loadKit();
      const { address } = await kit.authModal();
      setAddress(address);
      setStatus("connected");
    } catch {
      // User closed the modal or rejected — fall back to whatever we had.
      setStatus(address ? "connected" : "disconnected");
    }
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
