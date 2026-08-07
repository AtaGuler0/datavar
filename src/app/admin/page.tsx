import { AdminOverview } from "@/components/admin/overview";
import { PageHeading } from "@/components/dashboard/primitives";

export default function AdminPage() {
  return (
    <div>
      <PageHeading
        eyebrow="00 · Operator"
        title="The market."
        description="What the protocol has sold, what it owes contributors, and whether the treasury can cover it."
      />
      <AdminOverview />
    </div>
  );
}
