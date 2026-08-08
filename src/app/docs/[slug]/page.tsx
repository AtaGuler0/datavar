import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocArticle } from "@/components/docs/doc-article";
import { DOC_PAGES, findDoc } from "@/lib/docs";

/** The pages are a constant, so every one of them prerenders. */
export function generateStaticParams() {
  return DOC_PAGES.filter((page) => page.slug).map((page) => ({
    slug: page.slug,
  }));
}

// Nothing outside this list is a doc, so a stray path is a 404 rather than a
// render.
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findDoc(slug);
  if (!page) return {};

  return {
    title: page.title,
    description: page.summary,
    alternates: { canonical: `/docs/${slug}` },
  };
}

export default async function DocPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = findDoc(slug);
  if (!page || !page.slug) notFound();

  return <DocArticle page={page} />;
}
