import { POST_IMAGES_BUCKET, supabase } from "./client";

/**
 * The blog, as rows. Posts are written in the operator panel and stored as
 * markdown, so publishing is a database write rather than a deploy.
 *
 * Nothing here filters on `published_at`. It looks like an omission and isn't:
 * row-level security already refuses an unpublished post to anyone who isn't an
 * operator, so a query written here cannot leak a draft even if it forgets to
 * ask. Repeating the condition in the query would only hide which layer is
 * actually enforcing it. See the posts policies in schema.sql.
 */

export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** Markdown. Rendered by components/markdown.tsx, never as raw HTML. */
  body: string;
  author: string;
  /** Optional. A post without one is a post, not a broken card. */
  cover_url: string | null;
  cover_alt: string | null;
  /** Null while a draft; a future date means scheduled. */
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/** What the index needs. Bodies stay on the server until a post is opened. */
export type PostSummary = Omit<Post, "body">;

const SUMMARY_COLUMNS =
  "id, slug, title, excerpt, author, cover_url, cover_alt, published_at, created_at, updated_at";

/** Published posts, newest first. What /blog lists. */
export async function listPosts(): Promise<PostSummary[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(SUMMARY_COLUMNS)
    .order("published_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PostSummary[];
}

/** One post by slug, or null when there isn't one to show this reader. */
export async function getPost(slug: string): Promise<Post | null> {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return (data as Post) ?? null;
}

/**
 * Every post including drafts, for the editor. Identical query to `listPosts`
 * — what comes back differs because of who is asking, not what was asked.
 */
export async function listAllPosts(): Promise<PostSummary[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(SUMMARY_COLUMNS)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PostSummary[];
}

export type PostDraft = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  author: string;
  cover_url: string | null;
  cover_alt: string | null;
  published_at: string | null;
};

export async function createPost(draft: PostDraft): Promise<Post> {
  const { data, error } = await supabase
    .from("posts")
    .insert(draft)
    .select()
    .single();

  if (error) throw error;
  return data as Post;
}

export async function updatePost(
  id: string,
  draft: PostDraft,
): Promise<Post> {
  const { data, error } = await supabase
    .from("posts")
    .update(draft)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Post;
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) throw error;
}

/** Where a post stands, derived rather than stored. */
export function postStatus(
  post: Pick<Post, "published_at">,
): "draft" | "scheduled" | "published" {
  if (!post.published_at) return "draft";
  return Date.parse(post.published_at) > Date.now() ? "scheduled" : "published";
}

/**
 * "4 min read", at 220 words a minute. A rough number honestly presented is
 * more use to a reader deciding whether to start than no number at all.
 */
export function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

/**
 * Uploads an illustration and returns the URL a post can point at. The bucket
 * is public, so this is the one place in the product that deliberately puts a
 * file somewhere strangers can read: a picture nobody can fetch is not an
 * illustration. Writing to it is operators only.
 */
export async function uploadPostImage(file: File): Promise<string> {
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
    : "";
  const path = `${crypto.randomUUID()}${ext}`;

  const { error } = await supabase.storage
    .from(POST_IMAGES_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) throw error;

  const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** "Consent is a contract now" → "consent-is-a-contract-now". */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
