// Text input — control radius, hairline border, calm focus. Give it an accessible name
// (a <label>, aria-label, or aria-labelledby) at the call site.
import type { ComponentProps } from "react";
import { cx } from "../cx";

export type InputProps = ComponentProps<"input">;

export function Input({ className, ...rest }: InputProps) {
  return (
    <input
      className={cx(
        "h-10 w-full rounded-control border border-line bg-surface px-3.5 text-sm text-ink",
        "placeholder:text-muted",
        "outline-none transition-colors focus:border-ink/40",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}
