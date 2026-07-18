import { EmptyState, PageHeading } from "@/components/dashboard/primitives";

export default function UploadsPage() {
  return (
    <div>
      <PageHeading
        eyebrow="02 · Uploads"
        title="Direct uploads."
        description="Datasets you contribute by hand. Each file is hashed on your device before anything leaves, so the receipt can prove what you shared without exposing it."
      />
      <EmptyState
        title="The upload flow isn't built yet."
        note="This is where you'll add a file, describe it, and mint the consent receipt that goes with it."
      />
    </div>
  );
}
