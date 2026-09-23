import type { MouseEventHandler, ReactNode } from "react";
import { cx } from "../lib/cx";

// One button geometry for the whole page: 44px tall, 10px corners, sans 15.5px.
// `primary` = solid charcoal (every demo button); `secondary` = a quiet ink-tint
// fill with the same shape. Both carry a transparent border so Windows
// forced-colours mode still draws them. `href` renders an <a>; otherwise a real
// <button>. `icon` sits before the label. `busy` marks a pending action with
// aria-disabled, which keeps focus on the button (disabled dropped it to the
// page); the form's submit handler ignores presses meanwhile.
type Variant = "primary" | "secondary";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink/85",
  secondary: "bg-ink/[0.06] text-ink hover:bg-ink/[0.1]",
};

export function Button({
  variant = "primary",
  href,
  onClick,
  icon,
  type = "button",
  busy,
  className,
  children,
}: {
  variant?: Variant;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  icon?: ReactNode;
  type?: "button" | "submit";
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const cls = cx(
    "inline-flex h-[44px] cursor-pointer items-center justify-center gap-[8px] whitespace-nowrap rounded-[10px] border border-transparent px-[18px] font-medium text-[15.5px] no-underline transition-[background-color,color] duration-150 aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
    VARIANTS[variant],
    className,
  );
  if (href !== undefined) {
    return (
      <a href={href} onClick={onClick} className={cls}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      aria-disabled={busy || undefined}
      className={cls}
    >
      {icon}
      {children}
    </button>
  );
}
