import { PaidFigure } from "@/components/step-figures";
import { EarningsPanel } from "@/components/dashboard/earnings-panel";
import { PageHeading } from "@/components/dashboard/primitives";
import { WalletGate } from "@/components/dashboard/wallet-gate";

export default function EarningsPage() {
  return (
    <div>
      <PageHeading
        eyebrow="Contributor · 02 · Earnings"
        title="Payouts."
        aside="Claimed on your signature alone."
        description="What your data has sold for, and what's waiting in the payout contract for you to claim."
      />
      <WalletGate message="Connect your wallet to see your payouts." figure={<PaidFigure />}>
        <EarningsPanel />
      </WalletGate>
    </div>
  );
}
