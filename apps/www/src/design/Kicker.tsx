import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../lib/cx";
import { MonoLabel } from "./MonoLabel";

// A section eyebrow — the mono kicker above a heading (the retired `.ro-eyebrow`):
// 12px, wide 0.34em tracking, cream at 55%. `tone="hero"` is the brighter, slightly
// larger hero variant (`.ro-hero-eyebrow`). Renders block so it sits on its own line.
export function Kicker({
  tone = "section",
  className,
  ...rest
}: ComponentPropsWithoutRef<"span"> & { tone?: "section" | "hero" }) {
  return (
    <MonoLabel
      className={cx(
        "block tracking-[0.34em]",
        tone === "hero"
          ? "text-[12.5px] text-cream-60"
          : "text-[12px] text-cream-55",
        className,
      )}
      {...rest}
    />
  );
}
