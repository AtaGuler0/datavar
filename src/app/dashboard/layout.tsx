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
      <div className="flex min-h-screen bg-paper">
        <SideNav />
        {/* Content sits a shade below the rail and the cards, so the white
            surfaces read as raised — the SaaS-dashboard depth cue. */}
        <div className="flex min-w-0 flex-1 flex-col bg-paper-sunken/30">
          <TopBar />
          <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8 md:py-10">
            {children}
          </main>
        </div>
      </div>
    </WalletProvider>
  );
}
