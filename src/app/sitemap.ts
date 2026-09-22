import type { MetadataRoute } from "next";
import { DOC_PAGES, docHref } from "@/lib/docs";
import { SITE_URL } from "@/lib/site";
import { listPosts } from "@/lib/supabase/posts";

/**
 * Everything worth indexing, with a date against it.
 *
 * Three sources, and they are deliberately different kinds of thing. The four
 * marketing routes are fixed. The docs are written in lib/docs.ts, so they ship
 * with the build and cannot drift from what the site actually serves. The posts
 * come out of the database, which is the only part of this that can be wrong by
 * the time a crawler reads it — hence the revalidate below.
 *
 * `listPosts` reads with the anon key, so the row-level policy on `posts` is
 * what decides which ones appear: a draft has no `published_at` and a scheduled
 * one has a future date, and neither is visible to that key. The filter is the
 * database's rather than a condition here, which is why there isn't one.
 *
 * A failure falls back to the static half rather than throwing. A sitemap
 * missing its posts is a smaller problem than a 500 where the sitemap should
 * be, and it is the same rule the landing page keeps about its numbers.
 */
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const marketing: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/protocol`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/market`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];

  // docHref turns the empty slug into /docs itself, so the index is in here
  // once rather than listed separately and again by accident.
  const docs: MetadataRoute.Sitemap = DOC_PAGES.map((page) => ({
    url: `${SITE_URL}${docHref(page.slug)}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const posts = await listPosts().catch(() => []);
  const written: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    // What changed last, not when it went out: an edited post is a new page to
    // a crawler and `published_at` would never say so.
    lastModified: new Date(post.updated_at),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...marketing, ...docs, ...written];
}
