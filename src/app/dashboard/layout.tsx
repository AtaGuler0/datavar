import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
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
      <AppShell side="contributor" rail={<SideNav />}>
        <TopBar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8 md:py-10">
          {children}
        </main>
      </AppShell>
    </WalletProvider>
  );
}
