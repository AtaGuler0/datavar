"use client";

import { useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Composer } from "./composer";
import { Card } from "@/components/dashboard/primitives";
import { formatDate } from "@/lib/format";
import {
  createPost,
  deletePost,
  getPost,
  listAllPosts,
  postStatus,
  slugify,
  updatePost,
  uploadPostImage,
  type Post,
  type PostSummary,
} from "@/lib/supabase/posts";

/**
 * Writing and publishing, without a deploy.
 *
 * Two decisions worth naming. Publishing is a date, not a switch: leaving it
 * empty keeps a post a draft, and setting a date in the future schedules it,
 * because those are the same fact at different times. And the preview renders
 * through the same component the public page uses, so what an author checks
 * here is what a reader gets, rather than an approximation of it.
 */

type Draft = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  author: string;
  coverUrl: string;
  coverAlt: string;
  /** "YYYY-MM-DD", or empty for a draft. */
  publishedOn: string;
};

const EMPTY: Draft = {
  slug: "",
  title: "",
  excerpt: "",
  body: "",
  author: "Datavar",
  coverUrl: "",
  coverAlt: "",
  publishedOn: "",
};

/** The stored timestamp is an instant; the field is a day. Noon UTC keeps a
 *  date from sliding backwards for readers west of us. */
function toTimestamp(day: string): string | null {
  return day ? new Date(`${day}T12:00:00Z`).toISOString() : null;
}

function toDay(timestamp: string | null): string {
  return timestamp ? timestamp.slice(0, 10) : "";
}

export function PostEditor() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setPosts(await listAllPosts());
    } catch {
      setError("Couldn't load the posts.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listAllPosts()
      .then((rows) => !cancelled && setPosts(rows))
      .catch(() => !cancelled && setError("Couldn't load the posts."));
    return () => {
      cancelled = true;
    };
  }, []);

  const startNew = () => {
    setEditing(null);
    setDraft(EMPTY);
    setNote(null);
    setError(null);
  };

  const open = async (slug: string) => {
    setError(null);
    setNote(null);
    try {
      const post = await getPost(slug);
      if (!post) return setError("That post has gone.");
      setEditing(post);
      setDraft({
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        body: post.body,
        author: post.author,
        coverUrl: post.cover_url ?? "",
        coverAlt: post.cover_alt ?? "",
        publishedOn: toDay(post.published_at),
      });
    } catch {
      setError("Couldn't open that post.");
    }
  };

  const save = async () => {
    if (busy) return;
    const slug = draft.slug.trim() || slugify(draft.title);
    if (!draft.title.trim() || !draft.excerpt.trim() || !draft.body.trim()) {
      return setError("Title, excerpt and body are all needed.");
    }

    setBusy(true);
    setError(null);
    try {
      const payload = {
        slug,
        title: draft.title.trim(),
        excerpt: draft.excerpt.trim(),
        body: draft.body,
        author: draft.author.trim() || "Datavar",
        cover_url: draft.coverUrl.trim() || null,
        cover_alt: draft.coverAlt.trim() || null,
        published_at: toTimestamp(draft.publishedOn),
      };
      const saved = editing
        ? await updatePost(editing.id, payload)
        : await createPost(payload);
      setEditing(saved);
      setDraft((d) => ({ ...d, slug: saved.slug }));
      setNote(`Saved. ${postStatus(saved)}.`);
      await reload();
    } catch (e) {
      // A duplicate slug is the one failure an author causes and can fix.
      const message = e instanceof Error ? e.message : "";
      setError(
        /duplicate|unique/i.test(message)
          ? "Another post already uses that slug."
          : "Couldn't save. Nothing was written.",
      );
    } finally {
      setBusy(false);
    }
  };

  /** The one upload path. The composer places what comes back at the caret;
   *  the cover field puts it in its own slot. */
  const uploadImage = async (file: File): Promise<string> => {
    setError(null);
    try {
      return await uploadPostImage(file);
    } catch {
      setError("Couldn't upload that image.");
      throw new Error("upload failed");
    }
  };

  const uploadCover = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const url = await uploadImage(file);
      setDraft((d) => ({ ...d, coverUrl: url }));
    } catch {
      // uploadImage has already said what went wrong.
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await deletePost(editing.id);
      startNew();
      await reload();
    } catch {
      setError("Couldn't delete that post.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-10 grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card
        title="Posts"
        subtitle={posts ? `${posts.length} in total` : "Loading"}
        action={
          <button
            type="button"
            onClick={startNew}
            className="shrink-0 rounded-lg border border-rule-strong px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-paper-raised"
          >
            New
          </button>
        }
      >
        {posts === null ? (
          <div className="h-40 animate-pulse rounded-xl bg-paper-raised" />
        ) : posts.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">
            Nothing written yet.
          </p>
        ) : (
          <ul className="-mx-2">
            {posts.map((post) => {
              const status = postStatus(post);
              return (
                <li key={post.id}>
                  <button
                    type="button"
                    onClick={() => open(post.slug)}
                    className={`w-full rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-paper-raised ${
                      editing?.id === post.id ? "bg-paper-raised" : ""
                    }`}
                  >
                    <span className="block truncate text-sm text-ink">
                      {post.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-faint">
                      {status}
                      {post.published_at && ` · ${formatDate(post.published_at)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title={editing ? "Edit post" : "New post"}
        subtitle={
          editing ? `/blog/${editing.slug}` : "Saved as a draft until you date it"
        }
        action={
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="shrink-0 rounded-lg border border-rule-strong px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-paper-raised"
          >
            {preview ? "Keep writing" : "Preview post"}
          </button>
        }
      >
        {preview ? (
          <div className="rounded-xl border border-rule bg-paper-raised/40 p-6">
            {draft.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.coverUrl}
                alt={draft.coverAlt}
                className="mb-6 w-full rounded-lg border border-rule"
              />
            )}
            <h2 className="display text-2xl font-medium text-ink">
              {draft.title || "Untitled"}
            </h2>
            <div className="mt-6">
              <Markdown source={draft.body} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Title">
              <input
                value={draft.title}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    title: e.target.value,
                    // The slug follows the title until it's been touched, then
                    // stops: a published URL should not move under a reader.
                    slug: editing ? d.slug : slugify(e.target.value),
                  }))
                }
                className={INPUT}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Slug" hint="/blog/…">
                <input
                  value={draft.slug}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))
                  }
                  className={`${INPUT} font-mono`}
                />
              </Field>
              <Field label="Author">
                <input
                  value={draft.author}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, author: e.target.value }))
                  }
                  className={INPUT}
                />
              </Field>
            </div>

            <Field label="Excerpt" hint="Shown on the index and in link previews">
              <textarea
                value={draft.excerpt}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, excerpt: e.target.value }))
                }
                rows={2}
                className={INPUT}
              />
            </Field>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-ink">
                Body
              </span>
              <Composer
                value={draft.body}
                onChange={(body) => setDraft((d) => ({ ...d, body }))}
                onUpload={uploadImage}
                busy={busy}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label="Cover image" hint="Optional. Shown on the index and in link previews">
                <input
                  value={draft.coverUrl}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, coverUrl: e.target.value }))
                  }
                  placeholder="https://… or /blog/…"
                  spellCheck={false}
                  className={`${INPUT} font-mono text-xs`}
                />
              </Field>
              <label className="flex items-end">
                <span className={`${UPLOAD} ${busy ? "opacity-50" : ""}`}>
                  Upload
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadCover(e.target.files?.[0])}
                />
              </label>
            </div>

            {draft.coverUrl && (
              <Field label="Cover description" hint="What the picture shows, for readers who can't see it">
                <input
                  value={draft.coverAlt}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, coverAlt: e.target.value }))
                  }
                  className={INPUT}
                />
              </Field>
            )}

            <Field
              label="Publish on"
              hint="Empty is a draft; a future date schedules it"
            >
              <input
                type="date"
                value={draft.publishedOn}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, publishedOn: e.target.value }))
                }
                className={INPUT}
              />
            </Field>
          </div>
        )}

        {(error || note) && (
          <p className="mt-4 rounded-xl border border-rule bg-paper-raised px-4 py-3 text-sm text-ink-dim">
            {error ?? note}
          </p>
        )}

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center rounded-lg bg-slate-deep px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-slate disabled:opacity-50"
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Create post"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center rounded-lg border border-rule-strong px-4 py-2 text-sm text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

const UPLOAD =
  "inline-flex cursor-pointer items-center rounded-lg border border-rule-strong px-3.5 py-2 text-sm text-ink transition-colors hover:bg-paper-raised";

const INPUT =
  "w-full rounded-lg border border-rule bg-paper-raised px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-rule-strong disabled:opacity-50";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3 text-xs font-medium text-ink">
        {label}
        {hint && <span className="font-normal text-ink-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
