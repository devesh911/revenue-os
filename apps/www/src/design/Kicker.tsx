import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../lib/cx";
import { MonoLabel } from "./MonoLabel";

// A section eyebrow above a heading: small tracked mono caps led by a clay dot.
// `tone="hero"` is the pill badge above the <h1> with a softly pulsing dot;
// `tone="inverse"` is the eyebrow on the dark ink panel, `tone="clay"` the one on
// the clay panel (ink text, ink dot). Renders block-level.
const TONES = {
  section: "text-stone",
  inverse: "text-paper/60",
  clay: "text-ink/75",
} as const;

export function Kicker({
  tone = "section",
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"span"> & {
  tone?: "section" | "hero" | "inverse" | "clay";
}) {
  if (tone === "hero") {
    return (
      <MonoLabel
        className={cx(
          "inline-flex items-center gap-[10px] rounded-full border border-line bg-paper-2/70 py-[7px] pr-[14px] pl-[12px] text-[11.5px] text-ink-2 uppercase tracking-[0.12em]",
          className,
        )}
        {...rest}
      >
        <span className="relative flex size-[7px]" aria-hidden="true">
          <span className="absolute inset-0 animate-[ro-ring_2.4s_var(--ease-soft)_infinite] rounded-full bg-clay" />
          <span className="relative size-[7px] rounded-full bg-clay" />
        </span>
        {children}
      </MonoLabel>
    );
  }
  return (
    <MonoLabel
      className={cx(
        "flex items-center gap-[10px] text-[12px] uppercase tracking-[0.14em]",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cx(
          "size-[6px] shrink-0 rounded-full",
          tone === "clay" ? "bg-ink" : "bg-clay",
        )}
      />
      {children}
    </MonoLabel>
  );
}
