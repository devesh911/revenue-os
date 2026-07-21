// Top strip on the canvas: optional left title/breadcrumb slot, right-aligned pill
// actions (the router injects OrgSwitcher + Sign out; pages add their own via
// PageHeader, not here). Chrome-free on purpose — the calm comes from whitespace.
import type { ReactNode } from "react";

export function Topbar({
  title,
  actions,
}: {
  title?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-8">
      <div className="min-w-0 truncate text-sm font-medium text-ink-soft">
        {title}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2.5">{actions}</div>
      ) : null}
    </header>
  );
}
