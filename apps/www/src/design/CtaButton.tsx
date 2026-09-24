import type { MouseEventHandler, ReactNode } from "react";
import { cx } from "../lib/cx";

// The button skins. `accent` = the primary ink pill (paper text — it reads on paper
// and on the clay panel alike); `ghost` = ink text on a quiet hairline pill. Both
// carry a border (transparent on accent) so Windows forced-colours mode still
// draws the pill. `size` sets the pill's height and type; extra layout comes from
// the caller's className. Renders an <a> when `href` is set (marketing anchors), a
// real <button> otherwise. A trailing `arrow` nudges right on hover. A form's
// button takes `type="submit"`; `busy` marks its pending action with aria-disabled
// (set only when passed), which keeps focus on the button where `disabled` would
// drop it to the page — the fill fades, the focus ring stays full strength, and the
// form's own handler ignores presses meanwhile.
type CtaVariant = "accent" | "ghost";

const VARIANTS: Record<CtaVariant, string> = {
  accent: "border border-transparent bg-ink text-paper hover:bg-ink-2",
  ghost:
    "border border-ink/15 text-ink hover:border-ink/40 hover:bg-ink/[0.03]",
};

const BUSY: Record<CtaVariant, string> = {
  accent: "aria-disabled:cursor-not-allowed aria-disabled:bg-ink/60",
  ghost: "aria-disabled:cursor-not-allowed aria-disabled:text-ink/60",
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
  type = "button",
  busy,
  describedBy,
  className,
  children,
}: {
  variant: CtaVariant;
  size?: keyof typeof SIZES;
  arrow?: boolean;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit";
  busy?: boolean;
  describedBy?: string; // aria-describedby: a visible note that qualifies the action
  className?: string;
  children: ReactNode;
}) {
  const cls = cx(
    "group inline-flex cursor-pointer items-center justify-center gap-[8px] whitespace-nowrap rounded-full font-medium font-sans no-underline transition-[color,background-color,border-color] duration-200",
    VARIANTS[variant],
    SIZES[size],
    busy !== undefined && BUSY[variant],
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
      <a href={href} aria-describedby={describedBy} className={cls}>
        {body}
      </a>
    );
  }
  return (
    <button
      type={type}
      aria-disabled={busy}
      aria-describedby={describedBy}
      className={cls}
      onClick={onClick}
    >
      {body}
    </button>
  );
}
