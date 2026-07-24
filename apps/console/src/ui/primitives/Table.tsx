// Semantic table — <table>/<thead>/<tbody> carrying today's token classes, replacing the
// hand-rolled table markup + TH/TD class constants pages copy-paste (react-component.md tier 1).
// Dumb primitives: native prop passthrough + className merge via cx, tokens only. THead owns the
// header <tr>, so consumers nest <TH>s directly and body <Row>s live in a plain <tbody>.
import type { ComponentProps } from "react";
import { cx } from "../cx";

export type TableProps = ComponentProps<"table">;
export function Table({ className, ...rest }: TableProps) {
  return <table className={cx("w-full text-left", className)} {...rest} />;
}

export type THeadProps = ComponentProps<"thead">;
export function THead({ className, children, ...rest }: THeadProps) {
  return (
    <thead className={cx(className)} {...rest}>
      <tr className="border-b border-line">{children}</tr>
    </thead>
  );
}

export type THProps = ComponentProps<"th">;
export function TH({ className, ...rest }: THProps) {
  return (
    <th
      scope="col"
      className={cx(
        "py-2.5 pr-4 text-label text-muted uppercase font-medium",
        className,
      )}
      {...rest}
    />
  );
}

export type RowProps = ComponentProps<"tr">;
export function Row({ className, ...rest }: RowProps) {
  return (
    <tr
      className={cx("border-b border-line last:border-0", className)}
      {...rest}
    />
  );
}

export type TDProps = ComponentProps<"td">;
export function TD({ className, ...rest }: TDProps) {
  return (
    <td
      className={cx("py-3 pr-4 text-sm text-ink-soft", className)}
      {...rest}
    />
  );
}
