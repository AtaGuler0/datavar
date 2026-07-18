import { EmptyState, PageHeading } from "@/components/dashboard/primitives";
import { WalletGate } from "@/components/dashboard/wallet-gate";

export default function EarningsPage() {
  return (
    <div>
      <PageHeading
        eyebrow="04 · Earnings"
        title="Payouts."
        description="What you've been paid and how it's settled. Rare, high-signal data earns more than common data — you see the split per receipt."
      />
      <WalletGate message="Connect your wallet to see your payouts.">
        <EmptyState
          title="Earnings land here once payouts settle on-chain."
          note="Paid in XLM on Stellar testnet for now — instant, and yours to withdraw."
        />
      </WalletGate>
    </div>
  );
}
