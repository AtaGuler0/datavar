import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { DOC_GROUPS, docHref, docNeighbours, type DocPage } from "@/lib/docs";

/**
 * One documentation page. The header follows the same grammar as every other
 * heading in the product — mono eyebrow, tight display title, dimmed lede —
 * and the body is the blog's markdown renderer, so prose here sets the same
 * measure and rhythm a post does.
 */
export function DocArticle({ page }: { page: DocPage }) {
  const group = DOC_GROUPS.find((g) => g.pages.includes(page));
  const { prev, next } = docNeighbours(page.slug);

  return (
    /* Keyed on the slug so moving between two docs pages remounts the article
       and the animation runs again — without it React reuses the element and
       only the text changes, which is the snap this is here to soften. */
    <article key={page.slug} className="doc-enter max-w-2xl py-12 md:py-16">
      <header className="border-b border-rule pb-8">
        {group && <p className="eyebrow text-ink-faint">{group.title}</p>}
        <h1 className="display mt-3 text-[2rem] font-medium text-balance text-ink sm:text-[2.5rem]">
          {page.title}
        </h1>
        <p className="mt-4 text-pretty text-ink-dim">{page.summary}</p>
      </header>

      <div className="mt-8">
        <Markdown source={page.body} />
      </div>

      {(prev || next) && (
        <nav className="mt-16 grid gap-3 border-t border-rule pt-8 sm:grid-cols-2">
          {prev ? <NeighbourLink page={prev} direction="prev" /> : <span />}
          {next && <NeighbourLink page={next} direction="next" />}
        </nav>
      )}
    </article>
  );
}

/** Where to go from here. The arrow leads on the way out and follows on the
 *  way back, so direction is legible without reading the label. */
function NeighbourLink({
  page,
  direction,
}: {
  page: DocPage;
  direction: "prev" | "next";
}) {
  const next = direction === "next";

  return (
    <Link
      href={docHref(page.slug)}
      className={`group flex flex-col gap-1 rounded-xl border border-rule bg-paper p-4 transition-colors hover:border-rule-strong ${
        next ? "sm:col-start-2 sm:items-end sm:text-right" : ""
      }`}
    >
      <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
        {next ? "Next" : "Previous"}
      </span>
      <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
        {!next && <Arrow back />}
        {page.title}
        {next && <Arrow />}
      </span>
    </Link>
  );
}

function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3 w-3 shrink-0 text-ink-faint transition-transform duration-200 ${
        back ? "rotate-180 group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5"
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M6 3l5 5-5 5" strokeLinecap="round" />
    </svg>
  );
}
