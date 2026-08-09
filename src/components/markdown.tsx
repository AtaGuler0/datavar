import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A small markdown renderer, written here rather than pulled in.
 *
 * The reason is not weight, it's the output. Every markdown library worth
 * using hands back an HTML string, and the only way to put that on a page is
 * `dangerouslySetInnerHTML` — which means the safety of the blog rests on a
 * sanitiser being configured correctly forever. This builds React elements
 * instead. There is no path from a post's text to executable markup, because
 * markup is never produced: an author can type a `<script>` tag and a reader
 * sees the characters `<script>`.
 *
 * It covers what a post needs and refuses the rest. Anything unrecognised
 * falls through as a paragraph, which is the failure a writer can see and fix,
 * rather than one that silently drops their text.
 */

type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "image"; src: string; alt: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; text: string }
  | { kind: "rule" };

/** Links are the one place a post could reach outside itself, so they're the
 *  one place worth checking. Anything that isn't plainly a web address, a
 *  mail address or a path on this site is dropped, and the text stays. */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\/[^\s]+$/i.test(href)) return href;
  if (/^mailto:[^\s]+$/i.test(href)) return href;
  if (/^\/[^\s]*$/.test(href)) return href;
  return null;
}

/** Image sources are narrower still: https or a path we serve. No data: URIs,
 *  which are the usual way an svg smuggles a script past a naive check. */
function safeSrc(raw: string): string | null {
  const src = raw.trim();
  if (/^https:\/\/[^\s]+$/i.test(src)) return src;
  if (/^\/[^\s]*$/.test(src)) return src;
  return null;
}

const INLINE =
  /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/;

/** Bold, italics, code spans and links, resolved left to right. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let i = 0;

  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) {
      out.push(rest);
      break;
    }

    if (match.index > 0) out.push(rest.slice(0, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("`")) {
      out.push(
        // A code span is one unbreakable word as far as line breaking is
        // concerned, so a contract address or a long identifier used to push
        // the whole document wider than the screen — 106px of sideways scroll
        // on a 390px phone, from one token. Anywhere is the right rule here:
        // there is no syllable in a hash worth protecting.
        <code
          key={key}
          className="rounded bg-paper-sunken px-1.5 py-0.5 font-mono text-[0.85em] text-ink [overflow-wrap:anywhere]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = safeHref(token.slice(split + 2, -1));
      if (!href) {
        out.push(label);
      } else if (href.startsWith("/")) {
        out.push(
          <Link key={key} href={href} className="underline decoration-rule-strong underline-offset-2 transition-colors hover:text-ink">
            {label}
          </Link>,
        );
      } else {
        out.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-rule-strong underline-offset-2 transition-colors hover:text-ink"
          >
            {label}
          </a>,
        );
      }
    } else if (token.startsWith("**")) {
      out.push(
        <strong key={key} className="font-medium text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    rest = rest.slice(match.index + token.length);
  }

  return out;
}

function parse(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence, or the end of the document
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }

    if (/^(---|\*\*\*)\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }

    // One # is the post title, which the page renders itself, so a heading
    // inside the body starts at two.
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length === 2 ? 2 : 3,
        text: heading[2],
      });
      i++;
      continue;
    }

    // A line that is only an image becomes a figure. Inline images inside a
    // sentence are not supported, because a post that needs one wants a
    // figure and a caption instead.
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);
    if (image) {
      const src = safeSrc(image[2]);
      if (src) blocks.push({ kind: "image", src, alt: image[1] });
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        body.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ kind: "quote", text: body.join(" ") });
      continue;
    }

    const bullet = /^[-*]\s+/;
    const numbered = /^\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const pattern = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(lines[i].replace(pattern, ""));
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    // A paragraph runs until a blank line or the start of another block.
    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("> ") &&
      !/^#{2,3}\s/.test(lines[i]) &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i]) &&
      !/^!\[[^\]]*\]\([^)\s]+\)\s*$/.test(lines[i]) &&
      !/^(---|\*\*\*)\s*$/.test(lines[i])
    ) {
      body.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "paragraph", text: body.join(" ") });
  }

  return blocks;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-6">
      {parse(source).map((block, i) => {
        const key = `b${i}`;

        switch (block.kind) {
          case "heading":
            return block.level === 2 ? (
              <h2
                key={key}
                className="display pt-4 text-xl font-medium text-ink sm:text-2xl"
              >
                {inline(block.text, key)}
              </h2>
            ) : (
              <h3 key={key} className="pt-2 text-base font-medium text-ink">
                {inline(block.text, key)}
              </h3>
            );

          case "paragraph":
            return (
              // break-words rather than the anywhere above: prose should only
              // break a word when it genuinely cannot fit, which is what a
              // pasted URL in a sentence does.
              <p key={key} className="text-pretty break-words text-ink-dim">
                {inline(block.text, key)}
              </p>
            );

          case "list": {
            const items = block.items.map((item, j) => (
              <li key={`${key}-${j}`} className="text-pretty break-words text-ink-dim">
                {inline(item, `${key}-${j}`)}
              </li>
            ));
            return block.ordered ? (
              <ol key={key} className="ml-5 list-decimal space-y-2">
                {items}
              </ol>
            ) : (
              <ul key={key} className="ml-5 list-disc space-y-2">
                {items}
              </ul>
            );
          }

          case "quote":
            return (
              <blockquote
                key={key}
                className="border-l-2 border-rule-strong pl-5 text-pretty break-words text-ink"
              >
                {inline(block.text, key)}
              </blockquote>
            );

          case "code":
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-xl border border-rule bg-paper-sunken p-4 font-mono text-xs leading-relaxed text-ink-dim"
              >
                <code>{block.text}</code>
              </pre>
            );

          case "image":
            return (
              <figure key={key} className="py-2">
                {/* A plain img rather than next/image: an author's upload has
                    no intrinsic size we know at render time, and next/image
                    would need one to reserve space. Guessing it would trade a
                    real layout shift for a wrong one. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={block.src}
                  alt={block.alt}
                  loading="lazy"
                  decoding="async"
                  className="w-full rounded-xl border border-rule bg-paper-raised"
                />
                {block.alt && (
                  <figcaption className="mt-3 text-center text-xs text-ink-faint">
                    {block.alt}
                  </figcaption>
                )}
              </figure>
            );

          case "rule":
            return <hr key={key} className="border-rule" />;
        }
      })}
    </div>
  );
}
