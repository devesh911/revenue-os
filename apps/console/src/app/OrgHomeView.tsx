// Pure presentational view for the org-home landing state (task-16 AC3). It renders the three
// query states distinctly — a dead backend must NOT masquerade as "no orgs": ERROR names the API
// base URL and reads as unreachable, EMPTY keeps the existing "No orgs yet" copy, LOADING is
// unchanged. Navigation on success is the container's job (router.tsx redirects), so the has-orgs
// branch renders nothing here. Side-effect-free at module scope: type-only import of OrgListItem,
// no runtime pull of lib/api or lib/supabase.
import type { OrgListItem } from "../features/orgs/api";

export function OrgHomeView({
  isLoading,
  isError,
  orgs,
  apiBase,
}: {
  isLoading: boolean;
  isError: boolean;
  orgs: OrgListItem[] | undefined;
  apiBase: string;
}) {
  if (isLoading)
    return <div className="p-8 text-sm text-muted">Loading orgs…</div>;
  if (isError)
    return (
      <div className="p-8 text-sm text-danger">
        Can't reach the API at {apiBase}. Check that the server is running, then
        reload.
      </div>
    );
  if (!orgs || orgs.length === 0)
    return (
      <div className="p-8 text-sm text-muted">
        No orgs yet — create one via the API (console org-create UI lands in
        P3).
      </div>
    );
  return null; // container redirects once an org exists
}
