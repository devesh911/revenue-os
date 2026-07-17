// Pure presentational org switcher (task-16 AC4). ERROR shows a distinct indicator ("orgs
// offline") — never "no orgs", so a dead backend can't masquerade as an empty account; EMPTY
// keeps the existing "no orgs" copy. Selection wiring (current org, navigation) is supplied by
// the container as optional props, so the view is callable with just the three query-state props.
// Side-effect-free at module scope: type-only import of OrgListItem.
import type { OrgListItem } from "../features/orgs/api";

export function OrgSwitcherView({
  isLoading,
  isError,
  orgs,
  current,
  onSelect,
}: {
  isLoading: boolean;
  isError: boolean;
  orgs: OrgListItem[] | undefined;
  current?: string;
  onSelect?: (orgId: string) => void;
}) {
  if (isLoading) return <span className="text-xs text-gray-400">orgs…</span>;
  if (isError)
    return <span className="text-xs text-red-500">orgs offline</span>;
  if (!orgs || orgs.length === 0)
    return <span className="text-xs text-gray-400">no orgs</span>;

  const selected = current ?? orgs[0]?.id;
  return (
    <select
      className="rounded border px-2 py-1 text-sm"
      value={selected}
      onChange={(e) => onSelect?.(e.target.value)}
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name} ({o.role})
        </option>
      ))}
    </select>
  );
}
