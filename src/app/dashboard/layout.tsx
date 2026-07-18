import type { Metadata } from "next";
import { SideNav } from "@/components/dashboard/side-nav";
import { TopBar } from "@/components/dashboard/top-bar";
import { WalletProvider } from "@/components/dashboard/wallet-provider";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WalletProvider>
      <div className="flex min-h-screen flex-col bg-paper">
        <TopBar />
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row md:px-6">
          <SideNav />
          <main className="flex-1 px-6 py-8 md:px-8 md:py-12">{children}</main>
        </div>
      </div>
    </WalletProvider>
  );
}
