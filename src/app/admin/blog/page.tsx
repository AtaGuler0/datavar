import { PostEditor } from "@/components/admin/post-editor";
import { PageHeading } from "@/components/dashboard/primitives";

export default function AdminBlogPage() {
  return (
    <div>
      <PageHeading
        eyebrow="03 · Operator"
        title="Blog."
        description="Write, preview and publish. Posts are stored as markdown and rendered as elements rather than HTML, so nothing typed here can become markup on the page."
      />
      <PostEditor />
    </div>
  );
}
