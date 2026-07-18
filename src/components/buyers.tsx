import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

const VALUE = [
  {
    title: "Provenance on every row",
    body: "Each record resolves to a consenting person, an agreed purpose, and an expiry. Your legal team can audit any row you trained on.",
  },
  {
    title: "Recruit the cohort you actually need",
    body: "Filter by source, region, device, or demographic, then commission data that doesn't exist yet. Contributors opt in and start producing in days.",
  },
  {
    title: "Fresh, not frozen",
    body: "Scraped corpora are a snapshot of a dead internet. Datavar streams continuously, so your model sees this month, not 2023.",
  },
  {
    title: "Licensed and indemnified",
    body: "Commercial terms, warranties, and indemnity on every dataset. Deletion requests propagate to you within 24 hours.",
  },
];

export function Buyers() {
  return (
    <section id="buyers" className="bg-ink-950">
      <div className="mx-auto max-w-6xl px-6 py-28 sm:py-36">
        <SectionHeading
          tone="dark"
          eyebrow="For AI teams"
          title="Scraped data is a lawsuit with a training loss."
          body="Every record in Datavar is traceable to a consenting human, a signed purpose, and an expiry date. Filter a cohort, inspect the distribution, license it through one API."
        />

        <div className="mt-16 grid gap-14 lg:grid-cols-2 lg:gap-12">
          {/* min-w-0: without it the code block's min-content widens the whole
            grid column and the page scrolls sideways on mobile. */}
          <ul className="min-w-0 space-y-px">
            {VALUE.map((item, i) => (
              <Reveal as="li" key={item.title} delay={i * 80}>
                <div className="border-t border-rule-dark py-7">
                  <h3 className="flex items-start gap-3 text-lg font-medium tracking-tight text-chalk">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-soft" />
                    {item.title}
                  </h3>
                  <p className="mt-2.5 pl-[1.125rem] text-[0.9375rem] text-pretty text-chalk-dim">
                    {item.body}
                  </p>
                </div>
              </Reveal>
            ))}
            <div className="border-t border-rule-dark" />
          </ul>

          <Reveal delay={120} className="min-w-0 lg:pt-7">
            <div className="overflow-hidden rounded-xl border border-rule-dark bg-ink-900">
              <div className="flex items-center gap-2 border-b border-rule-dark bg-ink-850 px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-ink-800" />
                <span className="h-2 w-2 rounded-full bg-ink-800" />
                <span className="h-2 w-2 rounded-full bg-ink-800" />
                <span className="ml-2 font-mono text-[0.6875rem] text-chalk-faint">
                  cohort.py
                </span>
              </div>

              <pre className="overflow-x-auto p-5 font-mono text-[0.8125rem] leading-relaxed">
                <code>
                  <span className="text-chalk-faint">
                    # 4,102 consenting drivers, EU, streaming live
                  </span>
                  {"\n"}
                  <span className="text-slate-soft">from</span>
                  <span className="text-chalk-dim"> datavar </span>
                  <span className="text-slate-soft">import</span>
                  <span className="text-chalk-dim"> Client</span>
                  {"\n\n"}
                  <span className="text-chalk">client</span>
                  <span className="text-chalk-dim"> = </span>
                  <span className="text-chalk">Client</span>
                  <span className="text-chalk-dim">(api_key=</span>
                  <span className="text-chalk">&quot;gk_live_…&quot;</span>
                  <span className="text-chalk-dim">)</span>
                  {"\n\n"}
                  <span className="text-chalk">cohort</span>
                  <span className="text-chalk-dim"> = client.cohorts.</span>
                  <span className="text-chalk">create</span>
                  <span className="text-chalk-dim">(</span>
                  {"\n    "}
                  <span className="text-chalk-dim">sources=[</span>
                  <span className="text-chalk">&quot;dashcam&quot;</span>
                  <span className="text-chalk-dim">, </span>
                  <span className="text-chalk">&quot;location&quot;</span>
                  <span className="text-chalk-dim">],</span>
                  {"\n    "}
                  <span className="text-chalk-dim">region=</span>
                  <span className="text-chalk">&quot;EU&quot;</span>
                  <span className="text-chalk-dim">,</span>
                  {"\n    "}
                  <span className="text-chalk-dim">consent=</span>
                  <span className="text-chalk">&quot;commercial&quot;</span>
                  <span className="text-chalk-dim">,</span>
                  {"\n    "}
                  <span className="text-chalk-dim">fresher_than=</span>
                  <span className="text-chalk">&quot;30d&quot;</span>
                  <span className="text-chalk-dim">,</span>
                  {"\n"}
                  <span className="text-chalk-dim">)</span>
                  {"\n\n"}
                  <span className="text-slate-soft">for</span>
                  <span className="text-chalk-dim"> record </span>
                  <span className="text-slate-soft">in</span>
                  <span className="text-chalk-dim"> cohort.</span>
                  <span className="text-chalk">stream</span>
                  <span className="text-chalk-dim">():</span>
                  {"\n    "}
                  <span className="text-chalk">train</span>
                  <span className="text-chalk-dim">(record.payload)</span>
                  {"\n    "}
                  <span className="text-chalk">audit</span>
                  <span className="text-chalk-dim">(record.receipt) </span>
                  <span className="text-chalk-faint"># signed, revocable</span>
                </code>
              </pre>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <a
                href="#top"
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-rule-dark-strong bg-ink-900 px-5 py-3 text-sm font-medium text-chalk transition-colors hover:bg-ink-850"
              >
                Talk to sales
              </a>
              <a
                href="#top"
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-rule-dark bg-transparent px-5 py-3 text-sm font-medium text-chalk-dim transition-colors hover:text-chalk"
              >
                Read the docs
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
