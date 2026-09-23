import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

// A supporting label — 14px, sentence case, the readable grey. Pass `mono` only
// for a real timestamp or number (0:42, 11:42 AM, 47 sec); never for words.
export function Label({
  mono = false,
  className,
  ...rest
}: ComponentProps<"span"> & { mono?: boolean }) {
  return (
    <span
      className={cx(
        "leading-[1.45] text-ink-2",
        mono ? "font-mono text-[13px] tabular-nums" : "text-[14px]",
        className,
      )}
      {...rest}
    />
  );
}
