import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

// Body copy in the UI sans, as a <p>. `size`: "lede" (hero / section intros),
// "body" (cards), "small" (fine print). `tone` sets the colour for the ground it
// sits on — never recolour through className (cx() doesn't dedupe utilities).
type TextSize = "lede" | "body" | "small";
type TextTone = "default" | "muted" | "inverse" | "inverse-strong";

const SIZES: Record<TextSize, string> = {
  lede: "text-[18px] leading-[1.6] md:text-[20px]",
  body: "text-[15.5px] leading-[1.65]",
  small: "text-[14px] leading-[1.6]",
};

const TONES: Record<TextTone, string> = {
  default: "text-ink-2",
  muted: "text-stone",
  inverse: "text-paper/70",
  "inverse-strong": "text-paper/85",
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
