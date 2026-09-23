import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../lib/cx";

// A page section: a full-width semantic <section> holding the centred 1200px
// content column. `tone` sets the band — "plain" (paper), "wash" (paper-2 band),
// or an inset rounded panel: "ink" (the dark engine panel) / "clay" (the closing
// CTA). `className` tunes the INNER column (padding, layout); pass `id` for the
// in-page anchors (#how, #moats, #pricing, #faq, #cta) — scroll-mt clears the
// sticky nav.
export type SectionTone = "plain" | "wash" | "ink" | "clay";

const TONES: Record<SectionTone, string> = {
  plain: "",
  wash: "bg-paper-2",
  ink: "bg-grain mx-[10px] rounded-[28px] bg-ink text-paper md:mx-[20px] md:rounded-[40px]",
  clay: "bg-grain mx-[10px] rounded-[28px] bg-clay text-ink md:mx-[20px] md:rounded-[40px]",
};

export function SectionFrame({
  tone = "plain",
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"section"> & { tone?: SectionTone }) {
  return (
    <section className={cx("scroll-mt-[72px]", TONES[tone])} {...rest}>
      <div
        className={cx(
          "mx-auto w-full max-w-[1200px] px-[20px] py-[88px] md:px-[40px] md:py-[128px]",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}
