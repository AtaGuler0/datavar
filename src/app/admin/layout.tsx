import type { Metadata } from "next";
import { AdminGate } from "@/components/admin/admin-gate";
import { AppShell } from "@/components/app-shell";
import { AdminSideNav } from "@/components/admin/side-nav";
import { AdminTopBar } from "@/components/admin/top-bar";
import { WalletProvider } from "@/components/dashboard/wallet-provider";

export const metadata: Metadata = {
  title: "Admin",
  // Operator surface: keep it out of search results even though the gate
  // means there's nothing to see behind it.
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WalletProvider>
      <AppShell side="operator" rail={<AdminSideNav />}>
        <AdminTopBar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8 md:py-10">
          <AdminGate>{children}</AdminGate>
        </main>
      </AppShell>
    </WalletProvider>
  );
}
