"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";

/**
 * The writing surface.
 *
 * It stays a textarea over markdown rather than becoming a contentEditable
 * WYSIWYG, and that is a decision rather than a shortcut. A rich-text editor
 * produces HTML, and HTML on a page means `dangerouslySetInnerHTML`, which
 * would undo the one property the blog was built around: a post can never
 * become markup. What a writer actually wants from WordPress is not HTML, it
 * is the affordances, so those are what this adds.
 *
 * Everything acts on the selection: formatting wraps what you highlighted,
 * images land where the cursor is instead of at the end of the post, and a
 * block can be moved without cutting and pasting it. Dropping or pasting a
 * picture uploads it and drops it in at the caret, which is the part that
 * makes writing with images feel like writing rather than like assembling.
 */

type Mode = "write" | "split" | "preview";

/** Where an image belongs in markdown: alone on its line, blank line either
 *  side, so the renderer makes it a figure rather than part of a sentence. */
function imageBlock(url: string): string {
  return `![](${url})`;
}

export function Composer({
  value,
  onChange,
  onUpload,
  busy,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Uploads and resolves to a public URL. */
  onUpload: (file: File) => Promise<string>;
  busy?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<Mode>("write");
  const [dropping, setDropping] = useState(false);
  const [uploading, setUploading] = useState(false);

  /** Replaces a range and puts the caret back where the caller wants it. */
  const apply = useCallback(
    (next: string, selectStart: number, selectEnd = selectStart) => {
      onChange(next);
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(selectStart, selectEnd);
      });
    },
    [onChange],
  );

  const selection = useCallback(() => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    return { start, end, text: value.slice(start, end) };
  }, [value]);

  /** Wraps the selection, or drops in a placeholder and selects it so the
   *  next keystroke replaces it. */
  const wrap = useCallback(
    (before: string, after: string, placeholder: string) => {
      const { start, end, text } = selection();
      const body = text || placeholder;
      const next = `${value.slice(0, start)}${before}${body}${after}${value.slice(end)}`;
      const from = start + before.length;
      apply(next, from, from + body.length);
    },
    [apply, selection, value],
  );

  /** Puts a prefix on every line the selection touches, and takes it off
   *  again if all of them already have it. */
  const prefixLines = useCallback(
    (prefix: string | ((index: number) => string)) => {
      const { start, end } = selection();
      const from = value.lastIndexOf("\n", start - 1) + 1;
      const toIndex = value.indexOf("\n", end);
      const to = toIndex === -1 ? value.length : toIndex;

      const lines = value.slice(from, to).split("\n");
      const at = (i: number) => (typeof prefix === "string" ? prefix : prefix(i));
      const allPrefixed = lines.every((line, i) => line.startsWith(at(i)));

      const rewritten = lines
        .map((line, i) =>
          allPrefixed ? line.slice(at(i).length) : `${at(i)}${line}`,
        )
        .join("\n");

      const next = value.slice(0, from) + rewritten + value.slice(to);
      apply(next, from, from + rewritten.length);
    },
    [apply, selection, value],
  );

  /** Moves the line under the caret past its neighbour. The cheap version of
   *  dragging a block, and the one that works with a keyboard. */
  const moveLine = useCallback(
    (direction: -1 | 1) => {
      const { start } = selection();
      const lines = value.split("\n");
      let index = 0;
      let counted = 0;
      for (let i = 0; i < lines.length; i++) {
        if (counted + lines[i].length >= start) {
          index = i;
          break;
        }
        counted += lines[i].length + 1;
      }

      const target = index + direction;
      if (target < 0 || target >= lines.length) return;

      [lines[index], lines[target]] = [lines[target], lines[index]];
      const next = lines.join("\n");
      const caret = lines
        .slice(0, target)
        .reduce((sum, line) => sum + line.length + 1, 0);
      apply(next, caret);
    },
    [apply, selection, value],
  );

  /** Uploads and writes the image in at the caret, with the caret left inside
   *  the empty caption so typing names the picture. */
  const insertImage = useCallback(
    async (file: File) => {
      if (uploading) return;
      setUploading(true);
      try {
        const url = await onUpload(file);
        const { start, end } = selection();
        const before = value.slice(0, start);
        const after = value.slice(end);
        const lead = before && !before.endsWith("\n\n") ? "\n\n" : "";
        const tail = after && !after.startsWith("\n\n") ? "\n\n" : "";
        const block = `${lead}${imageBlock(url)}${tail}`;
        const caret = start + lead.length + 2; // just inside the empty ![ ]
        apply(before + block + after, caret);
      } finally {
        setUploading(false);
      }
    },
    [apply, onUpload, selection, uploading, value],
  );

  const words = useMemo(
    () => (value.trim() ? value.trim().split(/\s+/).length : 0),
    [value],
  );

  const disabled = busy || uploading;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-rule bg-paper-raised px-1.5 py-1.5">
        <Tool onClick={() => prefixLines("## ")} disabled={disabled}>
          H2
        </Tool>
        <Tool onClick={() => prefixLines("### ")} disabled={disabled}>
          H3
        </Tool>
        <Divider />
        <Tool
          onClick={() => wrap("**", "**", "bold")}
          disabled={disabled}
          bold
          title="Bold (⌘B)"
        >
          B
        </Tool>
        <Tool
          onClick={() => wrap("*", "*", "italic")}
          disabled={disabled}
          italic
          title="Italic (⌘I)"
        >
          I
        </Tool>
        <Tool
          onClick={() => wrap("`", "`", "code")}
          disabled={disabled}
          title="Inline code"
        >
          {"</>"}
        </Tool>
        <Tool
          onClick={() => wrap("[", "](https://)", "text")}
          disabled={disabled}
          title="Link (⌘K)"
        >
          Link
        </Tool>
        <Divider />
        <Tool onClick={() => prefixLines("- ")} disabled={disabled}>
          List
        </Tool>
        <Tool
          onClick={() => prefixLines((i) => `${i + 1}. `)}
          disabled={disabled}
        >
          1.
        </Tool>
        <Tool onClick={() => prefixLines("> ")} disabled={disabled}>
          Quote
        </Tool>
        <Tool
          onClick={() => wrap("```\n", "\n```", "code")}
          disabled={disabled}
        >
          Block
        </Tool>
        <Divider />
        <label className="contents">
          <span
            className={`${TOOL} ${disabled ? "opacity-40" : "cursor-pointer"}`}
            title="Insert an image at the cursor"
          >
            {uploading ? "Uploading…" : "Image"}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) insertImage(file);
            }}
          />
        </label>
        <Divider />
        <Tool
          onClick={() => moveLine(-1)}
          disabled={disabled}
          title="Move this line up (⌥↑)"
        >
          ↑
        </Tool>
        <Tool
          onClick={() => moveLine(1)}
          disabled={disabled}
          title="Move this line down (⌥↓)"
        >
          ↓
        </Tool>

        <div className="ml-auto flex items-center gap-1">
          {(["write", "split", "preview"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] transition-colors ${
                mode === m
                  ? "bg-ink-950 text-chalk"
                  : "text-ink-faint hover:text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`grid rounded-b-lg border border-t-0 border-rule ${
          mode === "split" ? "lg:grid-cols-2" : "grid-cols-1"
        }`}
      >
        {mode !== "preview" && (
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={22}
            spellCheck
            onKeyDown={(e) => {
              const meta = e.metaKey || e.ctrlKey;
              if (meta && e.key.toLowerCase() === "b") {
                e.preventDefault();
                wrap("**", "**", "bold");
              } else if (meta && e.key.toLowerCase() === "i") {
                e.preventDefault();
                wrap("*", "*", "italic");
              } else if (meta && e.key.toLowerCase() === "k") {
                e.preventDefault();
                wrap("[", "](https://)", "text");
              } else if (e.altKey && e.key === "ArrowUp") {
                e.preventDefault();
                moveLine(-1);
              } else if (e.altKey && e.key === "ArrowDown") {
                e.preventDefault();
                moveLine(1);
              }
            }}
            onPaste={(e) => {
              // A screenshot on the clipboard is the fastest way an image ever
              // gets into a post, so it is worth catching before the browser
              // pastes its filename.
              const file = Array.from(e.clipboardData.files)[0];
              if (file?.type.startsWith("image/")) {
                e.preventDefault();
                insertImage(file);
              }
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault();
                setDropping(true);
              }
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              const file = Array.from(e.dataTransfer.files)[0];
              setDropping(false);
              if (file?.type.startsWith("image/")) {
                e.preventDefault();
                insertImage(file);
              }
            }}
            className={`w-full resize-y bg-paper-raised px-3 py-3 font-mono text-xs leading-relaxed text-ink outline-none transition-colors ${
              dropping ? "bg-paper-sunken" : ""
            } ${mode === "split" ? "lg:border-r lg:border-rule" : ""}`}
          />
        )}

        {mode !== "write" && (
          <div className="overflow-y-auto bg-paper px-5 py-5" style={{ maxHeight: "34rem" }}>
            {value.trim() ? (
              <Markdown source={value} />
            ) : (
              <p className="text-sm text-ink-faint">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>

      <p className="mt-2 flex items-center justify-between font-mono text-[0.625rem] text-ink-faint">
        <span>
          Drop or paste a picture straight in. Alt+arrow moves a block.
        </span>
        <span>
          {words} {words === 1 ? "word" : "words"}
        </span>
      </p>
    </div>
  );
}

const TOOL =
  "inline-flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs text-ink-dim transition-colors hover:bg-paper-sunken hover:text-ink";

function Tool({
  onClick,
  disabled,
  title,
  bold,
  italic,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  bold?: boolean;
  italic?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${TOOL} ${bold ? "font-semibold" : ""} ${italic ? "italic" : ""} disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px bg-rule-strong" />;
}
