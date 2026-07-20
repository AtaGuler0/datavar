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
      {/* The shell is viewport-sized and only the content column scrolls —
          the body never moves, so whatever the wallet kit appends after us
          can't add stray scroll height or shove the rail off-screen. */}
      <div className="flex h-dvh bg-paper">
        <SideNav />
        {/* Content sits a shade below the rail and the cards, so the white
            surfaces read as raised — the SaaS-dashboard depth cue. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-paper-sunken/30">
          <TopBar />
          <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8 md:py-10">
            {children}
          </main>
        </div>
      </div>
    </WalletProvider>
  );
}
