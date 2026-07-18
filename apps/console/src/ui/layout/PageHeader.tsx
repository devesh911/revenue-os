// Page title block: big tight-bold h1, optional muted description, right-aligned pill
// actions. Every page starts with one (except the Home hero, which uses text-hero).
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pt-4 pb-6">
      <div className="min-w-0">
        <h1 className="text-h1">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2.5">{actions}</div>
      ) : null}
    </div>
  );
}
