import { PageHeading } from "@/components/dashboard/primitives";
import { UploadFlow } from "@/components/dashboard/upload-flow";
import { WalletGate } from "@/components/dashboard/wallet-gate";

export default function UploadsPage() {
  return (
    <div>
      <PageHeading
        eyebrow="02 · Uploads"
        title="Direct uploads."
        description="Datasets you contribute by hand. Each file is hashed on your device before anything leaves, so the receipt can prove what you shared without exposing it."
      />
      <WalletGate message="Connect your wallet to upload a dataset and mint its receipt.">
        <UploadFlow />
      </WalletGate>
    </div>
  );
}
