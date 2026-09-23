import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

// A page section: a full-width <section> (paper, or the quiet `wash` band) holding
// the centred 1160px content column. Rhythm: two paper sections meet 56px apart on
// mobile and 88px on desktop (each pads half); a wash band pads the full amount
// inside its own edge, which already separates it from its neighbours.
// `className` tunes the INNER column; `flush` drops the vertical padding. Pass
// `id` for the in-page anchors; html's scroll-padding clears the sticky nav.
export function Section({
  tone = "plain",
  flush = false,
  className,
  children,
  ...rest
}: ComponentProps<"section"> & { tone?: "plain" | "wash"; flush?: boolean }) {
  return (
    <section className={tone === "wash" ? "bg-wash" : undefined} {...rest}>
      <div
        className={cx(
          "mx-auto w-full max-w-[1224px] px-[20px] md:px-[32px]",
          !flush &&
            (tone === "wash"
              ? "py-[56px] md:py-[88px]"
              : "py-[28px] md:py-[44px]"),
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}
