import type { Metadata } from "next";
import { WalletProvider } from "@/components/dashboard/wallet-provider";
import { MarketChrome } from "@/components/market/chrome";

export const metadata: Metadata = {
  title: "TRY ramp",
  description:
    "Turn Turkish lira into USDC to license data with, and USDC earnings back into lira. A standard SEP anchor, authenticated by your own wallet.",
};

export default function AnchorLayout({
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
