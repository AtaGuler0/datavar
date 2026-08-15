import { EarningsPanel } from "@/components/dashboard/earnings-panel";
import { PageHeading } from "@/components/dashboard/primitives";
import { WalletGate } from "@/components/dashboard/wallet-gate";

export default function EarningsPage() {
  return (
    <div>
      <PageHeading
        eyebrow="04 · Earnings"
        title="Payouts."
        description="What your data has sold for, and what's waiting to be claimed. Your earnings are held in a payout contract on Stellar — claiming signs a transaction with your wallet, and the contract pays you."
      />
      <WalletGate message="Connect your wallet to see your payouts.">
        <EarningsPanel />
      </WalletGate>
    </div>
  );
}
