import { EmptyState, PageHeading } from "@/components/dashboard/primitives";
import { WalletGate } from "@/components/dashboard/wallet-gate";

export default function SourcesPage() {
  return (
    <div>
      <PageHeading
        eyebrow="01 · Sources"
        title="Connected sources."
        description="The accounts, devices and files you've linked. Access stays read-only, scoped, and revocable the second you change your mind."
      />
      <WalletGate message="Connect your wallet to link and manage your sources.">
        <EmptyState
          title="Source connections aren't wired up yet."
          note="This is where you'll link browsing, health, purchases and media, each behind its own consent."
        />
      </WalletGate>
    </div>
  );
}
