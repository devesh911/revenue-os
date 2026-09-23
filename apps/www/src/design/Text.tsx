import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cx } from "../lib/cx";

// Body copy in the UI sans. Defaults to <p>; pass `as="span"` for inline copy.
// `size`: "lede" (hero / section intros), "body" (cards), "small" (fine print).
// Colour defaults to ink-2 on paper; on the dark panel pass a text-paper/* class.
export type TextSize = "lede" | "body" | "small";

const SIZES: Record<TextSize, string> = {
  lede: "text-[18px] leading-[1.6] md:text-[20px]",
  body: "text-[15.5px] leading-[1.65]",
  small: "text-[14px] leading-[1.6]",
};

export function Text({
  as: Tag = "p",
  size = "body",
  className,
  ...rest
}: ComponentPropsWithoutRef<"p"> & { as?: ElementType; size?: TextSize }) {
  return (
    <Tag
      className={cx("m-0 text-pretty text-ink-2", SIZES[size], className)}
      {...rest}
    />
  );
}
