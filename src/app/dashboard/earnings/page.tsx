import { EarningsPanel } from "@/components/dashboard/earnings-panel";
import { PageHeading } from "@/components/dashboard/primitives";
import { WalletGate } from "@/components/dashboard/wallet-gate";

export default function EarningsPage() {
  return (
    <div>
      <PageHeading
        eyebrow="04 · Earnings"
        title="Payouts."
        description="What your data has sold for, and what's waiting to be claimed. Every claim settles as an XLM payment to the wallet you're signed in with."
      />
      <WalletGate message="Connect your wallet to see your payouts.">
        <EarningsPanel />
      </WalletGate>
    </div>
  );
}
