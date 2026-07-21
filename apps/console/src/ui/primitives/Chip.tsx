// Suggestion chip — a rounded outline pill that acts (a <button>). Used for the Home
// hero suggestions and any quick-action row. Optional leading line icon (~15px).
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../cx";

export type ChipProps = ComponentProps<"button"> & {
  icon?: ReactNode;
};

export function Chip({
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-pill border border-line bg-surface px-4",
        "text-[13px] font-medium text-ink-soft transition-colors hover:bg-nav-active hover:text-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
      {...rest}
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0 text-muted">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
