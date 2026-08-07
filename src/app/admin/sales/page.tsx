import { SaleLedger } from "@/components/admin/sale-ledger";
import { PageHeading } from "@/components/dashboard/primitives";

export default function AdminSalesPage() {
  return (
    <div>
      <PageHeading
        eyebrow="02 · Operator"
        title="Sales."
        description="Every licence issued and every payout settled against it. Run a round to simulate demand while the buyer side is built."
      />
      <SaleLedger />
    </div>
  );
}
