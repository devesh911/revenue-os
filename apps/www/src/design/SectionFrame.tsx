import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../lib/cx";

// The section frame — a cream hairline box with no top border, so consecutive
// sections share one seam down the page (the retired `.ro-section` chrome, and the
// top-border-less stacking of hero/logos/footer). Renders a semantic <section>;
// pass `id` for the in-page anchor links (#how, #moats, #pricing, #cta).
export function SectionFrame({
  className,
  ...rest
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      className={cx("border border-hairline-22 border-t-0", className)}
      {...rest}
    />
  );
}
