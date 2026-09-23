import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

// Two card grounds. "wash": a quiet fill, no border — for explanation blocks.
// "product": white with a hairline — the edge of a product screen (a summary, a
// message, a call), where the border is information, not decoration.
export function Card({
  tone = "wash",
  className,
  ...rest
}: ComponentProps<"div"> & { tone?: "wash" | "product" }) {
  return (
    <div
      className={cx(
        tone === "wash"
          ? "rounded-[14px] bg-wash"
          : "rounded-[12px] border border-line bg-surface",
        className,
      )}
      {...rest}
    />
  );
}
