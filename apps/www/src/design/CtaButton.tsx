import type { MouseEventHandler, ReactNode } from "react";
import { cx } from "../lib/cx";

// The button skins. `accent` = the primary ink pill (paper text); `ghost` = ink
// text on a quiet hairline pill; `inverse` = the paper pill used on the dark ink
// and clay panels. `size` sets the pill's height and type; extra layout comes from
// the caller's className. Renders an <a> when `href` is set (marketing anchors), a
// real <button> otherwise (plan select). A trailing `arrow` nudges right on hover.
export type CtaVariant = "accent" | "ghost" | "inverse";

const VARIANTS: Record<CtaVariant, string> = {
  accent: "bg-ink text-paper hover:bg-ink-2",
  ghost:
    "border border-ink/15 text-ink hover:border-ink/40 hover:bg-ink/[0.03]",
  inverse: "bg-paper text-ink hover:bg-paper-2",
};

const SIZES = {
  md: "h-[42px] px-[18px] text-[14.5px]",
  lg: "h-[52px] px-[26px] text-[15.5px]",
} as const;

export function CtaButton({
  variant,
  size = "lg",
  arrow = false,
  href,
  onClick,
  className,
  children,
}: {
  variant: CtaVariant;
  size?: keyof typeof SIZES;
  arrow?: boolean;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  children: ReactNode;
}) {
  const cls = cx(
    "group inline-flex cursor-pointer items-center justify-center gap-[8px] whitespace-nowrap rounded-full font-medium font-sans no-underline transition-[color,background-color,border-color] duration-200",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
  const body = (
    <>
      {children}
      {arrow ? (
        <span
          aria-hidden="true"
          className="transition-transform duration-300 ease-[var(--ease-soft)] group-hover:translate-x-[3px]"
        >
          →
        </span>
      ) : null}
    </>
  );
  if (href !== undefined) {
    return (
      <a href={href} className={cls}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  );
}
