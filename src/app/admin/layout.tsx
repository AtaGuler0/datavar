import type { Metadata } from "next";
import { AdminGate } from "@/components/admin/admin-gate";
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
      {/* Same shell as the contributor dashboard — viewport-sized, only the
          content column scrolls. */}
      <div className="flex h-dvh bg-paper">
        <AdminSideNav />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-paper-sunken/30">
          <AdminTopBar />
          <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8 md:py-10">
            <AdminGate>{children}</AdminGate>
          </main>
        </div>
      </div>
    </WalletProvider>
  );
}
