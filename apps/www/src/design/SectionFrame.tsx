import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../lib/cx";

// A page section: a full-width semantic <section> holding the centred 1200px
// content column. `tone` sets the band — "plain" (paper), "wash" (paper-2 band),
// or an inset rounded panel: "ink" (the dark engine panel) / "clay" (the closing
// CTA — its focus rings turn ink, as the global clay ring vanishes on clay).
// `className` tunes the INNER column (layout, extra padding); `flush` drops the
// default vertical padding so a band can set its own without fighting it. Pass
// `id` for the in-page anchors (#how, #moats, #pricing, #faq, #cta) — scroll-mt
// clears the sticky nav.
export type SectionTone = "plain" | "wash" | "ink" | "clay";

const TONES: Record<SectionTone, string> = {
  plain: "",
  wash: "bg-paper-2",
  ink: "bg-grain mx-[10px] rounded-[28px] bg-ink text-paper md:mx-[20px] md:rounded-[40px]",
  clay: "bg-grain mx-[10px] rounded-[28px] bg-clay text-ink md:mx-[20px] md:rounded-[40px] [&_:focus-visible]:outline-ink",
};

export function SectionFrame({
  tone = "plain",
  flush = false,
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"section"> & {
  tone?: SectionTone;
  flush?: boolean;
}) {
  return (
    <section className={cx("scroll-mt-[72px]", TONES[tone])} {...rest}>
      <div
        className={cx(
          "mx-auto w-full max-w-[1200px] px-[20px] md:px-[40px]",
          !flush && "py-[88px] md:py-[128px]",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}
