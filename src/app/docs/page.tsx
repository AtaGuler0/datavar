import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocArticle } from "@/components/docs/doc-article";
import { findDoc } from "@/lib/docs";

const page = findDoc("");

export const metadata: Metadata = {
  title: page?.title ?? "Documentation",
  description: page?.summary,
  alternates: { canonical: "/docs" },
};

export default function DocsIndex() {
  if (!page) notFound();
  return <DocArticle page={page} />;
}
