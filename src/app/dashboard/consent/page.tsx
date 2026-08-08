import { ConsentPanel } from "@/components/dashboard/consent-panel";
import { WalletGate } from "@/components/dashboard/wallet-gate";
import { PageHeading } from "@/components/dashboard/primitives";

export default function ConsentPage() {
  return (
    <div>
      <PageHeading
        eyebrow="03 · Consent"
        title="Consent receipts."
        description="Every approval you've signed: which dataset, which buyer, for what purpose, and until when. Each one is a record on Stellar — the protocol enforces it, not a PDF nobody reads."
      />
      <WalletGate message="Connect your wallet to see the receipts you've signed.">
        <ConsentPanel />
      </WalletGate>
    </div>
  );
}
