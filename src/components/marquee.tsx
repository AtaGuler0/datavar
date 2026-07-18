const TEAMS = [
  "Northwind AI",
  "Halcyon Labs",
  "Meridian Research",
  "Kessler Institute",
  "Vantage Robotics",
  "Sable Health",
  "Orbit Foundation",
];

export function Marquee() {
  return (
    <section className="relative border-y border-rule bg-paper py-10">
      <p className="mb-8 text-center font-mono text-[0.6875rem] tracking-[0.18em] text-ink-faint uppercase">
        Datasets licensed by teams at
      </p>

      <div className="group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <div className="flex w-max animate-[marquee_38s_linear_infinite] group-hover:[animation-play-state:paused]">
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              aria-hidden={copy === 1}
              className="flex shrink-0 items-center"
            >
              {TEAMS.map((team) => (
                <li
                  key={team}
                  className="px-9 text-lg font-medium whitespace-nowrap text-ink-faint transition-colors duration-300 hover:text-ink-dim"
                >
                  {team}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
