import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

// Serif display headings (Lora 400 — editorial, sentence case, tight tracking).
// `level` picks the page-level tag: 1 = the single <h1> (hero), 2 = section heads;
// `as="h3"` is a card / plan / FAQ title. `size` is the shared scale (defaults:
// h1 display, h2 section, h3 card; "none" leaves sizing to className). Lines are
// balanced unless `balance={false}` asks for the greedy wrap.
type HeadingSize = "display" | "section" | "card" | "none";

const SIZES: Record<HeadingSize, string> = {
  display:
    "text-[clamp(42px,6.2vw,64px)] leading-[1.02] tracking-[-0.032em] lg:text-[clamp(50px,4.7vw,60px)]",
  section: "text-[clamp(32px,3.6vw,46px)] leading-[1.08] tracking-[-0.022em]",
  card: "text-[25px] leading-[1.2] tracking-[-0.014em]",
  none: "",
};

type HeadingProps = ComponentProps<"h2"> & {
  level?: 1 | 2;
  as?: "h3";
  size?: HeadingSize;
  balance?: boolean;
};

export function Heading({
  level = 2,
  as,
  size,
  balance = true,
  className,
  ...rest
}: HeadingProps) {
  const Tag = as ?? (level === 1 ? "h1" : "h2");
  const scale = size ?? (as ? "card" : level === 1 ? "display" : "section");
  return (
    <Tag
      className={cx(
        "font-normal font-serif",
        balance && "text-balance",
        SIZES[scale],
        className,
      )}
      {...rest}
    />
  );
}
