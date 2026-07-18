import type { ReactNode } from "react";
import { Reveal } from "./reveal";

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = "left",
  tone = "light",
}: {
  eyebrow: string;
  title: ReactNode;
  body?: string;
  align?: "left" | "center";
  tone?: "light" | "dark";
}) {
  const centered = align === "center";
  const dark = tone === "dark";

  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <Reveal>
        <p className={`eyebrow ${dark ? "text-chalk-faint" : "text-ink-faint"}`}>
          {eyebrow}
        </p>
      </Reveal>
      <Reveal delay={60}>
        <h2
          className={`display mt-4 text-[2rem] font-medium text-balance sm:text-[2.75rem] ${
            dark ? "text-chalk" : "text-ink"
          }`}
        >
          {title}
        </h2>
      </Reveal>
      {body && (
        <Reveal delay={120}>
          <p
            className={`mt-5 text-base text-pretty sm:text-lg ${
              dark ? "text-chalk-dim" : "text-ink-dim"
            }`}
          >
            {body}
          </p>
        </Reveal>
      )}
    </div>
  );
}
