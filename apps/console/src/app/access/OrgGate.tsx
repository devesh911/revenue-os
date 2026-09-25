// The org-scoped shell's membership gate (AC-C8): members of /o/:orgId get the shell; anyone else
// gets the no-access page. With no workspace list in hand yet, the landing's honest loading /
// error states show instead — never the shell, never a false "no access".
import type { ReactNode } from "react";
import { useParams } from "wouter";
import { useOrgsQuery } from "../../features/orgs/api";
import { API_URL } from "../../lib/api";
import { OrgHomeView } from "../OrgHomeView";
import { useSession } from "../session/SessionProvider";
import { NoAccessView } from "./NoAccessView";
import { orgAccess } from "./org-access";

export function OrgGate({ children }: { children: ReactNode }) {
  const { orgId = "" } = useParams<{ orgId?: string }>();
  const { data: orgs, isLoading } = useOrgsQuery();
  const { signOut } = useSession();
  const access = orgAccess(orgId, orgs, isLoading);
  if (access === "member") return children;
  if (access === "no-access")
    return <NoAccessView orgs={orgs ?? []} onSignOut={signOut} />;
  return <OrgsStatus />;
}

/** The workspace list's loading / error / empty states — shared by this gate and the / landing. */
export function OrgsStatus() {
  const { data, isLoading, isError, error, refetch } = useOrgsQuery();
  const { signOut } = useSession();
  return (
    <OrgHomeView
      isLoading={isLoading}
      isError={isError}
      error={error}
      orgs={data}
      apiBase={API_URL}
      onRetry={() => void refetch()}
      onSignOut={signOut}
    />
  );
}
