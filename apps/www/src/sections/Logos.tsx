import { logos, logosCaption } from "../content/logos";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { cx } from "../lib/cx";
import { reveal } from "../lib/reveal";

// The trust row, quiet under the hero: a tracked caption over five wordmarks that
// read as five different brands through type alone, at an even grey value — ink/60,
// the quietest that still clears 4.5:1 (styles by index, so no brand name is
// inlined here). md+: one evenly spaced row — it fits from 768px. Below md: a slow
// seamless marquee — the list twice on a w-max track sliding -50%, the copy
// aria-hidden; it halts on hover and with the page's pause switch (styles.css).
// Reduced motion drops the copy and wraps the list, static and centred. The frame
// is flush: the hairlined block owns this band's rhythm.
const WORDMARKS = [
  "font-serif text-[16px] tracking-[0.26em]",
  "font-sans font-medium text-[17px] tracking-[-0.03em]",
  "font-serif italic text-[20px] tracking-[-0.01em]",
  "font-mono text-[15px] tracking-[0.02em]",
  "font-sans text-[15px] tracking-[0.4em]",
];

export function Logos() {
  return (
    <SectionFrame flush>
      <div
        {...reveal(200)}
        className="flex flex-col items-center gap-[24px] border-line border-t pt-[36px] pb-[48px] md:gap-[28px] md:pt-[48px] md:pb-[64px]"
      >
        <MonoLabel className="text-balance text-center text-[11.5px] text-stone uppercase tracking-[0.1em] md:tracking-[0.14em]">
          {logosCaption}
        </MonoLabel>
        <div className="w-full overflow-hidden max-md:motion-safe:mask-fade-x">
          <div className="flex w-max animate-[ro-marquee_32s_linear_infinite] hover:[animation-play-state:paused] md:w-full md:animate-none motion-reduce:w-full">
            {[false, true].map((copy) => (
              <ul
                key={String(copy)}
                aria-hidden={copy || undefined}
                className={cx(
                  "flex items-baseline",
                  copy
                    ? "md:hidden motion-reduce:hidden"
                    : "md:mx-auto md:w-full md:max-w-[1000px] md:justify-between motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-[12px]",
                )}
              >
                {logos.map((logo, i) => (
                  <li
                    key={logo}
                    className={cx(
                      "whitespace-nowrap px-[26px] text-ink/60 transition-colors duration-300 hover:text-ink/80 md:px-[12px] motion-reduce:px-[16px]",
                      WORDMARKS[i],
                    )}
                  >
                    {logo}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
    </SectionFrame>
  );
}
