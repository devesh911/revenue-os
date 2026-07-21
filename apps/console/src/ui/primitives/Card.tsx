// Surface card — white, card radius, hairline border, soft shadow. The default wrapper
// for any block of content sitting on the canvas.
import type { ComponentProps } from "react";
import { cx } from "../cx";

const PADDING = {
  none: "",
  md: "p-5",
  lg: "p-7",
} as const;

export type CardProps = ComponentProps<"div"> & {
  padding?: keyof typeof PADDING;
};

export function Card({ padding = "md", className, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-card border border-line bg-surface shadow-card",
        PADDING[padding],
        className,
      )}
      {...rest}
    />
  );
}
