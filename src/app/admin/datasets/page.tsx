import { ConsentSync } from "@/components/admin/consent-sync";
import { DatasetInventory } from "@/components/admin/dataset-inventory";
import { PageHeading } from "@/components/dashboard/primitives";

export default function AdminDatasetsPage() {
  return (
    <div>
      <PageHeading
        eyebrow="01 · Operator"
        title="Datasets."
        description="Every contribution on the protocol. Price one and license it, and the contributor has a payout waiting."
      />
      <div className="mt-8">
        <ConsentSync />
      </div>
      <DatasetInventory />
    </div>
  );
}
