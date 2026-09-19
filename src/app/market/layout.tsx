import type { Metadata } from "next";
import { MarketChrome } from "@/components/market/chrome";
import { WalletProvider } from "@/components/dashboard/wallet-provider";

export const metadata: Metadata = {
  title: "Data marketplace",
  description:
    "License consented, contributor-owned datasets. Every listing stands on a consent receipt you can check on-chain, and every payment goes into the payout vault the contributors claim from.",
};

export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WalletProvider>
      <div className="min-h-dvh bg-paper-sunken/30">
        <MarketChrome />
        {children}
      </div>
    </WalletProvider>
  );
}
