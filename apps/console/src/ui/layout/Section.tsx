// Content grouping: small uppercase letter-spaced gray label + optional right-side
// actions above the group's content. Use for "Recent conversations"-style clusters.
import type { ReactNode } from "react";
import { cx } from "../cx";

export function Section({
  label,
  actions,
  className,
  children,
}: {
  label: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx(className)}>
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-label text-muted uppercase">{label}</h2>
        {actions ? (
          <div className="flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
