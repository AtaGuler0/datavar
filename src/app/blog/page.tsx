import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LinkProgress } from "@/components/link-progress";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { formatDate } from "@/lib/format";
import { listPosts, type PostSummary } from "@/lib/supabase/posts";

/**
 * Posts are database rows, so this can't be baked at build time and left
 * there. Five minutes, same as the landing page: long enough that traffic
 * doesn't turn into queries, short enough that publishing feels immediate.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Blog",
  description:
    "What we're building at Datavar, and what we got wrong on the way.",
  alternates: { canonical: "/blog" },
};

export default async function BlogIndex() {
  // A blog that 500s because the data plane blinked is worse than one that
  // says it has nothing today.
  const posts = await listPosts().catch((): PostSummary[] => []);

  return (
    /* Asymmetric on purpose: the shell already reserves pt-16 for the fixed
       nav, so a symmetric py-32 stacked on top of it left the title floating
       in a screen of nothing. The bottom keeps its room. */
    <div className="mx-auto max-w-6xl px-6 pt-12 pb-24 sm:pt-16 sm:pb-32">
      <SectionHeading
        eyebrow="Blog"
        title="What we're building, and what we got wrong."
        body="Notes from the people making this. Written when there is something to report, not on a schedule."
      />

      <div className="mt-16 border-t border-rule">
        {posts.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-dim">
            Nothing published yet. The first posts are being written.
          </p>
        ) : (
          posts.map((post, i) => (
            <Reveal key={post.id} delay={i * 60}>
              <article className="border-b border-rule">
                <Link
                  href={`/blog/${post.slug}`}
                  className="group relative flex flex-col gap-2 py-8 transition-opacity active:opacity-70 sm:flex-row sm:items-baseline sm:gap-10"
                >
                  <LinkProgress />
                  <time
                    dateTime={post.published_at ?? undefined}
                    className="shrink-0 font-mono text-xs text-ink-faint tabular-nums sm:w-28"
                  >
                    {post.published_at
                      ? formatDate(post.published_at)
                      : "Draft"}
                  </time>
                  <div className="max-w-2xl flex-1">
                    <h2 className="display text-xl font-medium text-balance text-ink transition-colors group-hover:text-slate sm:text-2xl">
                      {post.title}
                    </h2>
                    <p className="mt-2 text-pretty text-ink-dim">
                      {post.excerpt}
                    </p>
                  </div>
                  {post.cover_url && (
                    // The container fixes the ratio, so next/image can do its
                    // job here even though an author's upload has no size we
                    // know: object-cover decides what to crop.
                    <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-lg border border-rule bg-paper-raised sm:w-44">
                      <Image
                        src={post.cover_url}
                        alt={post.cover_alt ?? ""}
                        fill
                        sizes="(min-width: 640px) 11rem, 100vw"
                        className="object-cover"
                      />
                    </div>
                  )}
                </Link>
              </article>
            </Reveal>
          ))
        )}
      </div>
    </div>
  );
}
