import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../lib/cx";

// Display headings (Playfair Display, weight 500 — the retired `.ro-display`).
// `level` picks the semantic tag: 1 = the single page <h1> (hero), 2 = section
// heads. `as="div"`/`as="span"` render display-styled text that is NOT a semantic
// heading (card titles, plan names, the FAQ questions that sit inside a <button>
// and so must be phrasing content) — keeping the page at exactly one <h1>.
type HeadingProps = ComponentPropsWithoutRef<"h2"> & {
  level?: 1 | 2;
  as?: "h1" | "h2" | "div" | "span";
};

export function Heading({ level = 2, as, className, ...rest }: HeadingProps) {
  const Tag = as ?? (level === 1 ? "h1" : "h2");
  return (
    <Tag className={cx("m-0 font-display font-medium", className)} {...rest} />
  );
}
