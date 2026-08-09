import { SeedPanel } from "@/components/admin/seed-panel";
import { PageHeading } from "@/components/dashboard/primitives";

export default function AdminDemoPage() {
  return (
    <div>
      <PageHeading
        eyebrow="04 · Operator"
        title="Demo data."
        description="An empty protocol shows nothing about itself. This fills it with plausible contributions so every screen can be judged on what it looks like in use."
      />
      <SeedPanel />
    </div>
  );
}
