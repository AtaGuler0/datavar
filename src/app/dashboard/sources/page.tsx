import { EmptyState, PageHeading } from "@/components/dashboard/primitives";

export default function SourcesPage() {
  return (
    <div>
      <PageHeading
        eyebrow="01 · Sources"
        title="Connected sources."
        description="The accounts, devices and files you've linked. Access stays read-only, scoped, and revocable the second you change your mind."
      />
      <EmptyState
        title="Source connections aren't wired up yet."
        note="This is where you'll link browsing, health, purchases and media — each behind its own consent."
      />
    </div>
  );
}
