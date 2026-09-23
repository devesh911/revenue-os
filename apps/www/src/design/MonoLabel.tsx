import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../lib/cx";

// The mono base (IBM Plex Mono) for machine data — timestamps, scores, stage
// numbers, tracked labels. Size/tracking/colour layer on via className. Renders a
// <span>; passes through data-* / aria-* attributes.
export function MonoLabel({
  className,
  ...rest
}: ComponentPropsWithoutRef<"span">) {
  return <span className={cx("font-mono", className)} {...rest} />;
}
