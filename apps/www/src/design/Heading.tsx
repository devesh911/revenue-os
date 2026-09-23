import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../lib/cx";

// Serif display headings (Lora 400 — editorial, sentence case, tight tracking).
// `level` picks the semantic tag: 1 = the single page <h1> (hero), 2 = section
// heads. `as` renders display-styled text that is NOT a page-level heading (card
// titles use "h3"; plan names, FAQ questions inside a <button> use "span"/"div"),
// keeping the page at exactly one <h1>. `size` is the shared scale; "none" leaves
// sizing to the caller's className.
export type HeadingSize = "display" | "section" | "card" | "none";

const SIZES: Record<HeadingSize, string> = {
  display: "text-[clamp(42px,6.2vw,84px)] leading-[1.02] tracking-[-0.032em]",
  section: "text-[clamp(34px,4.4vw,56px)] leading-[1.06] tracking-[-0.026em]",
  card: "text-[25px] leading-[1.2] tracking-[-0.014em]",
  none: "",
};

type HeadingProps = ComponentPropsWithoutRef<"h2"> & {
  level?: 1 | 2;
  as?: "h1" | "h2" | "h3" | "div" | "span";
  size?: HeadingSize;
};

export function Heading({
  level = 2,
  as,
  size,
  className,
  ...rest
}: HeadingProps) {
  const Tag = as ?? (level === 1 ? "h1" : "h2");
  const scale = size ?? (level === 1 && !as ? "display" : "section");
  return (
    <Tag
      className={cx(
        "m-0 text-balance font-normal font-serif",
        SIZES[scale],
        className,
      )}
      {...rest}
    />
  );
}
