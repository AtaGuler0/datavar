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
    <section className="bg-night px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 border-b border-line py-16 sm:flex-row sm:justify-between">
        <p className="text-sm text-star-faint">Built by people previously at</p>
        <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-3">
          {PRIOR.map((company) => (
            <li
              key={company}
              className="text-2xl font-medium tracking-[-0.04em] whitespace-nowrap text-star-faint transition-colors duration-300 hover:text-star"
            >
              {company}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
