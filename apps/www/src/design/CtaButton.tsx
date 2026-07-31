import type { MouseEventHandler, ReactNode } from "react";
import { cx } from "../lib/cx";

// The two button skins from the export. `accent` = gold fill, dark ink (the primary
// CTAs); `ghost` = cream text on a cream hairline border (SEE THE ENGINE, CHOOSE
// PLAN). Sizing comes from the caller's className — shared skin, context modifier.
// Renders an <a> when `href` is set (marketing anchors), a real <button> otherwise
// (plan select). Hover is instant (no transition, matching the export); focus-visible
// draws a gold ring on the night ground — the keyboard-a11y quality floor.
export type CtaVariant = "accent" | "ghost";

const VARIANTS: Record<CtaVariant, string> = {
  accent: "bg-gold text-ground font-medium hover:opacity-[0.88]",
  ghost: "text-cream border border-cream-45 hover:bg-cream-07",
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-[3px]";

export function CtaButton({
  variant,
  href,
  onClick,
  className,
  children,
}: {
  variant: CtaVariant;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  children: ReactNode;
}) {
  const cls = cx(
    "inline-block no-underline",
    VARIANTS[variant],
    FOCUS,
    className,
  );
  if (href !== undefined) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  );
}
