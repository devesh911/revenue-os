import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

// The heading ranks. Serif (Lora) is reserved for the two statements that carry
// the page — the hero <h1> ("display") and the closing invitation ("statement");
// every other heading is the UI sans: section heads (the default <h2>) and card /
// example titles (`as="h3"`, size "card"). The one file allowed `font-serif`
// (architecture test), so the ranking can't drift.
type HeadingSize = "display" | "statement" | "section" | "card";

const SIZES: Record<HeadingSize, string> = {
  display:
    "font-serif font-normal text-[38px] leading-[1.06] tracking-[-0.025em] min-[380px]:text-[40px] md:text-[54px] lg:text-[56px] xl:text-[62px]",
  statement:
    "font-serif font-normal text-[31px] leading-[1.12] tracking-[-0.02em] md:text-[44px]",
  section:
    "font-sans font-semibold text-[29px] leading-[1.15] tracking-[-0.022em] md:text-[36px]",
  card: "font-sans font-semibold text-[18px] leading-[1.35] tracking-[-0.01em] md:text-[19px]",
};

type HeadingProps = ComponentProps<"h2"> & {
  level?: 1 | 2;
  as?: "h2" | "h3";
  size?: HeadingSize;
};

export function Heading({
  level = 2,
  as,
  size,
  className,
  ...rest
}: HeadingProps) {
  const Tag = level === 1 ? "h1" : (as ?? "h2");
  const scale =
    size ?? (level === 1 ? "display" : Tag === "h3" ? "card" : "section");
  return (
    <Tag
      className={cx("text-balance text-ink", SIZES[scale], className)}
      {...rest}
    />
  );
}
