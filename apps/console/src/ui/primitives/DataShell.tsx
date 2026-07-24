// Data-page state shell — the loading / error / empty / content branch every data page
// hand-rolls, promoted to one primitive (react-component.md tier 1). Dumb: typed props,
// tokens only; precedence loading > error > empty > children (children render only on the
// happy path). Each non-happy state is a calm muted <p>, matching today's page copy.
import type { ReactNode } from "react";

const STATE = "text-sm text-muted";

export type DataShellProps = {
  isLoading: boolean;
  isError: boolean;
  isEmpty?: boolean;
  loadingText?: string;
  errorText?: string;
  emptyText?: string;
  children?: ReactNode;
};

export function DataShell({
  isLoading,
  isError,
  isEmpty,
  loadingText = "Loading…",
  errorText = "Unable to load data.",
  emptyText,
  children,
}: DataShellProps) {
  if (isLoading) return <p className={STATE}>{loadingText}</p>;
  if (isError) return <p className={STATE}>{errorText}</p>;
  if (isEmpty) return <p className={STATE}>{emptyText}</p>;
  return <>{children}</>;
}
