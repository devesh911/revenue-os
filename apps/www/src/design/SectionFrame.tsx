import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

// A page section: a full-width semantic <section> holding the centred 1200px
// content column. `tone` sets the ground — "plain" (paper) or one of the three
// inset rounded panels that pace the page: "ink" (the dark engine panel), "wash"
// (the paper-2 pricing panel), "clay" (the closing CTA — its focus rings turn
// ink, as the global ring vanishes on clay).
// `className` tunes the INNER column (layout, extra padding); `flush` drops the
// default vertical padding so a band can set its own without fighting it. Pass
// `id` for the in-page anchors (#how, #examples, #pilot, #faq, #cta); html's
// scroll-padding clears the sticky nav.
type SectionTone = "plain" | "wash" | "ink" | "clay";

const PANEL = "mx-[10px] rounded-[28px] md:mx-[20px] md:rounded-[40px]";

const TONES: Record<SectionTone, string> = {
  plain: "",
  wash: cx(PANEL, "bg-paper-2"),
  ink: cx(PANEL, "bg-grain bg-ink text-paper"),
  clay: cx(PANEL, "bg-grain bg-clay text-ink [&_:focus-visible]:outline-ink"),
};

export function SectionFrame({
  tone = "plain",
  flush = false,
  className,
  children,
  ...rest
}: ComponentProps<"section"> & {
  tone?: SectionTone;
  flush?: boolean;
}) {
  return (
    <section className={TONES[tone]} {...rest}>
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
