// Pill button — the console's only button. Dumb primitive: typed props, tokens only
// (react-component.md tier 1). variant=primary is the ONE black-filled action per view;
// secondary is the outline pill; ghost is chrome-free. Optional leading icon (line icon
// from ui/icons, sized ~16).
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../cx";

const VARIANTS = {
  primary: "bg-ink text-surface hover:bg-ink-soft",
  secondary: "border border-line bg-surface text-ink hover:bg-nav-active",
  ghost: "text-ink-soft hover:bg-nav-active hover:text-ink",
} as const;

const SIZES = {
  sm: "h-8 gap-1.5 px-3.5 text-[13px]",
  md: "h-10 gap-2 px-5 text-sm",
} as const;

export type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-pill font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
