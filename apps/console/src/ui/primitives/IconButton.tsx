// Circular icon-only button (e.g. the hero send button). aria-label is REQUIRED —
// an icon button with no accessible name is a bug. Child = one line icon from ui/icons.
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../cx";

const VARIANTS = {
  primary: "bg-ink text-surface hover:bg-ink-soft",
  secondary:
    "border border-line bg-surface text-ink-soft hover:bg-nav-active hover:text-ink",
  ghost: "text-ink-soft hover:bg-nav-active hover:text-ink",
} as const;

const SIZES = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
} as const;

export type IconButtonProps = ComponentProps<"button"> & {
  "aria-label": string;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  children: ReactNode;
};

export function IconButton({
  variant = "primary",
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-pill transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
