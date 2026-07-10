// Org switcher — org selection lives in the URL (R7: sharable location → URL).
import { useLocation, useParams } from "wouter";
import { useOrgsQuery } from "../features/orgs/api";

export function OrgSwitcher() {
  const { data: orgs, isLoading } = useOrgsQuery();
  const params = useParams<{ orgId?: string }>();
  const [location, navigate] = useLocation();

  if (isLoading) return <span className="text-xs text-gray-400">orgs…</span>;
  if (!orgs || orgs.length === 0)
    return <span className="text-xs text-gray-400">no orgs</span>;

  const current = params.orgId ?? orgs[0]?.id;
  const screen = location.split("/")[3] ?? "tasks";

  return (
    <select
      className="rounded border px-2 py-1 text-sm"
      value={current}
      onChange={(e) => navigate(`/o/${e.target.value}/${screen}`)}
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name} ({o.role})
        </option>
      ))}
    </select>
  );
}
