import { EmptyState, PageHeading } from "@/components/dashboard/primitives";

export default function ConsentPage() {
  return (
    <div>
      <PageHeading
        eyebrow="03 · Consent"
        title="Consent receipts."
        description="Every approval you've signed: which dataset, which buyer, for what purpose, and until when. Revoke any of them and access ends at expiry."
      />
      <EmptyState
        title="Receipts will show up here once they're on-chain."
        note="Each receipt is a signed record on Stellar — the protocol enforces it, not a PDF nobody reads."
      />
    </div>
  );
}
