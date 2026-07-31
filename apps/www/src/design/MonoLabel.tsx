import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../lib/cx";

// The mono base (IBM Plex Mono) — every tracked label, eyebrow, caption, and feature
// row layers size/tracking/colour on top via className, exactly like the retired
// `.ro-mono` base class. Renders a <span>; passes through data-* / aria-* attributes.
export function MonoLabel({
  className,
  ...rest
}: ComponentPropsWithoutRef<"span">) {
  return <span className={cx("font-mono", className)} {...rest} />;
}
