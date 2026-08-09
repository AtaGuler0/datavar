import { DataPanel } from "@/components/dashboard/data-panel";
import { PageHeading } from "@/components/dashboard/primitives";
import { WalletGate } from "@/components/dashboard/wallet-gate";

export default function DataPage() {
  return (
    <div>
      <PageHeading
        eyebrow="01 · Your data"
        title="Your data."
        description="Everything you've contributed, and where each dataset stands: hashed on your device, consented to on the ledger, licensed, paid. Whatever it needs next is on the row itself, and every receipt you've signed is one view away."
      />
      <WalletGate message="Connect your wallet to see and contribute data.">
        <DataPanel />
      </WalletGate>
    </div>
  );
}
