import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

// Body copy in the UI sans, as a <p>. `size`: "lede" (hero / section intros),
// "body" (17–18px, the reading size), "small" (supporting copy). `tone`: "default"
// (charcoal) or "muted" (the readable grey) — never recolour through className
// (cx() doesn't dedupe utilities).
type TextSize = "lede" | "body" | "small";
type TextTone = "default" | "muted";

const SIZES: Record<TextSize, string> = {
  lede: "text-[18px] leading-[1.55] md:text-[20px]",
  body: "text-[17px] leading-[1.6] md:text-[18px]",
  small: "text-[15px] leading-[1.55]",
};

const TONES: Record<TextTone, string> = {
  default: "text-ink",
  muted: "text-ink-2",
};

export function Text({
  size = "body",
  tone = "default",
  className,
  ...rest
}: ComponentProps<"p"> & { size?: TextSize; tone?: TextTone }) {
  return (
    <p
      className={cx("text-pretty", SIZES[size], TONES[tone], className)}
      {...rest}
    />
  );
}
