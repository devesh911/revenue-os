// Small status pill ("New"-style). tone=accent is the sparing gold highlight — use it
// for the one thing that deserves attention (live status, "New"); neutral for the rest.
import type { ComponentProps } from "react";
import { cx } from "../cx";

const TONES = {
  neutral: "bg-nav-active text-ink-soft",
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger/10 text-danger",
} as const;

export type BadgeProps = ComponentProps<"span"> & {
  tone?: keyof typeof TONES;
};

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}
