import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cx } from "../lib/cx";

// Body copy (Lora — inherited from the page shell, no font class needed). Defaults
// to <p>; pass `as="span"` for inline copy (the intent-split rows). Size and colour
// tier come from className so each context tunes its own weight of cream.
export function Text({
  as: Tag = "p",
  className,
  ...rest
}: ComponentPropsWithoutRef<"p"> & { as?: ElementType }) {
  return <Tag className={cx("m-0", className)} {...rest} />;
}
