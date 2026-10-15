import { ConnectFigure } from "@/components/step-figures";
import { DataPanel } from "@/components/dashboard/data-panel";
import { PageHeading } from "@/components/dashboard/primitives";
import { WalletGate } from "@/components/dashboard/wallet-gate";

export default function DataPage() {
  return (
    <div>
      <PageHeading
        eyebrow="Contributor · 01 · Your data"
        title="Your data."
        aside="Where every dataset stands."
        description="Hashed, consented, licensed, paid: each row says what it needs next."
      />
      <WalletGate message="Connect your wallet to see and contribute data." figure={<ConnectFigure />}>
        <DataPanel />
      </WalletGate>
    </div>
  );
}
