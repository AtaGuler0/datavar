/**
 * The credential strip under the hero. This used to be a scrolling wall of
 * client names, which claimed licensing relationships that don't exist. It now
 * says the one thing about the team that is checkable: where they worked
 * before. Two names don't need to scroll — a marquee with two items reads as a
 * loading bug — so it sits still and centred.
 */
const PRIOR = ["io.net", "Hacken"];

export function Marquee() {
  return (
    <section className="relative border-y border-rule bg-paper py-10">
      <p className="mb-6 text-center font-mono text-[0.6875rem] tracking-[0.18em] text-ink-faint uppercase">
        Built by people previously at
      </p>

      <ul className="flex flex-wrap items-center justify-center gap-x-9 gap-y-3">
        {PRIOR.map((company) => (
          <li
            key={company}
            className="text-lg font-medium whitespace-nowrap text-ink-faint transition-colors duration-300 hover:text-ink-dim"
          >
            {company}
          </li>
        ))}
      </ul>
    </section>
  );
}
