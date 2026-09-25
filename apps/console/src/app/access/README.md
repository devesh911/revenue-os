# access — is this workspace yours?

The membership check for org-scoped URLs (`/o/:orgId/…`), decided from the signed-in person's own
workspace list (`useOrgsQuery`). It is a UI courtesy, not access control: the API checks membership
on every call (`docs/security.md` S7.5).

- `org-access.ts` — pure `orgAccess(orgId, orgs, isLoading)` → `loading` · `member` · `no-access`.
  A malformed (non-uuid) id is never a workspace; no list in hand yet reads as `loading`.
- `OrgGate.tsx` — wraps the org shell: members get the shell, anyone else `NoAccessView`; with no
  list yet it shows the landing's honest loading / error states. It also exports `OrgsStatus`, the
  one container for those states (`../OrgHomeView.tsx` wired to the query), which the `/` landing reuses.
- `NoAccessView.tsx` — "You don't have access to this workspace", a link to each of their own
  workspaces, and Sign out.
