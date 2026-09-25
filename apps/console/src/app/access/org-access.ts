// Is /o/:orgId one of the person's own workspaces? Decided from their own workspace list;
// a malformed (non-uuid) id is never a workspace, so it needs no list. No list in hand yet (still
// loading, paused offline, or failed) → "loading": the caller shows that state honestly.
// UI only — the API checks membership on every call (docs/security.md S7.5).
import { OrgIdSchema } from "@revenue-os/shared";

export type OrgAccess = "loading" | "member" | "no-access";

export function orgAccess(
  orgId: string,
  orgs: { id: string }[] | undefined,
  isLoading: boolean,
): OrgAccess {
  if (!OrgIdSchema.safeParse(orgId).success) return "no-access";
  if (isLoading || !orgs) return "loading";
  return orgs.some((org) => org.id === orgId) ? "member" : "no-access";
}
