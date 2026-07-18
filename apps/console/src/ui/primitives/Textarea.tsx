// Multi-line input — same skin as Input, comfortable min height.
import type { ComponentProps } from "react";
import { cx } from "../cx";

export type TextareaProps = ComponentProps<"textarea">;

export function Textarea({ className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cx(
        "min-h-24 w-full rounded-control border border-line bg-surface px-3.5 py-2.5 text-sm text-ink",
        "placeholder:text-muted",
        "outline-none transition-colors focus:border-ink/40",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}
