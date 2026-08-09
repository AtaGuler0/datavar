import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { formatDate } from "@/lib/format";
import { getPost, postStatus, readingMinutes } from "@/lib/supabase/posts";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug).catch(() => null);
  if (!post) return { title: "Not found" };

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: `/blog/${post.slug}`,
      type: "article",
      publishedTime: post.published_at ?? undefined,
      authors: [post.author],
      images: post.cover_url ? [post.cover_url] : undefined,
    },
    // A draft reached by guessing its URL still shouldn't end up in an index.
    robots: postStatus(post) === "published" ? undefined : { index: false },
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug).catch(() => null);

  // Row-level security answers with nothing for a draft unless an operator is
  // asking, so "not published" and "does not exist" arrive here as the same
  // thing. They should also leave as the same thing: a 404 tells a stranger
  // fishing for unpublished URLs no more than it tells anyone else.
  if (!post) notFound();

  const status = postStatus(post);

  return (
    /* Same top spacing as the blog index — see the note there. Keyed on the
       slug so following a link from one post to another remounts the article
       and the arrival animation runs again, the same reason the docs article
       is keyed. */
    <article
      key={post.slug}
      className="post-enter mx-auto max-w-3xl px-6 pt-12 pb-24 sm:pt-16 sm:pb-32"
    >
      <Link
        href="/blog"
        className="font-mono text-[0.6875rem] tracking-[0.14em] text-ink-faint uppercase transition-colors hover:text-ink-dim"
      >
        ← Blog
      </Link>

      <h1 className="display mt-8 text-[2rem] font-medium text-balance text-ink sm:text-[2.75rem]">
        {post.title}
      </h1>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink-faint">
        <span>{post.author}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={post.published_at ?? undefined}>
          {post.published_at ? formatDate(post.published_at) : "Unpublished"}
        </time>
        <span aria-hidden="true">·</span>
        <span>{readingMinutes(post.body)} min read</span>
        {status !== "published" && (
          <span className="rounded-full border border-rule-strong px-2 py-0.5 uppercase tracking-[0.1em]">
            {status}
          </span>
        )}
      </div>

      <p className="mt-8 border-l-2 border-rule-strong pl-5 text-lg text-pretty text-ink">
        {post.excerpt}
      </p>

      {post.cover_url && (
        <figure className="mt-10">
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-rule bg-paper-raised">
            <Image
              src={post.cover_url}
              alt={post.cover_alt ?? ""}
              fill
              priority
              sizes="(min-width: 768px) 48rem, 100vw"
              className="object-cover"
            />
          </div>
          {post.cover_alt && (
            <figcaption className="mt-3 text-center text-xs text-ink-faint">
              {post.cover_alt}
            </figcaption>
          )}
        </figure>
      )}

      <div className="mt-12">
        <Markdown source={post.body} />
      </div>
    </article>
  );
}
