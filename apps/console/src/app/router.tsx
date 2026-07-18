// wouter routes behind the auth guard (S7.5). Org context lives in the URL (R7).
// The route table is src/routes.tsx — the Switch below AND the AppShell sidebar both
// read it, so pages register once. Sign-out stays HERE (not in ui/) so router.tsx
// remains a getSupabase() consumer (boot-honesty AC-R4) and ui/ stays supabase-free.
import type { ReactNode } from "react";
import { Redirect, Route, Switch } from "wouter";
import { useOrgsQuery } from "../features/orgs/api";
import { API_URL } from "../lib/api";
import { getSupabase } from "../lib/supabase";
import { routes } from "../routes";
import { AppShell } from "../ui/layout/AppShell";
import { Button } from "../ui/primitives";
import { OrgHomeView } from "./OrgHomeView";
import { OrgSwitcher } from "./OrgSwitcher";
import { UserChip } from "./UserChip";

const NAV = routes.filter((r) => !r.hidden);

function OrgHome() {
  const { data: orgs, isLoading, isError } = useOrgsQuery();
  const first = orgs?.[0];
  if (first) return <Redirect to={`/o/${first.id}/home`} />;
  return (
    <OrgHomeView
      isLoading={isLoading}
      isError={isError}
      orgs={orgs}
      apiBase={API_URL}
    />
  );
}

function Chrome({ children }: { children: ReactNode }) {
  return (
    <AppShell
      nav={NAV}
      actions={
        <>
          <OrgSwitcher />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => getSupabase().auth.signOut()}
          >
            Sign out
          </Button>
        </>
      }
      user={<UserChip />}
    >
      {children}
    </AppShell>
  );
}

export function Router() {
  return (
    <Switch>
      <Route path="/" component={OrgHome} />
      {/* ONE org-scoped route hosts the shell, so AppShell (sidebar/topbar/user chip)
          mounts once and persists across page navigations — only the inner Switch swaps
          the content pane. Per-page <Route> wrappers here would remount the whole shell
          (and re-fire UserChip's session fetch) on every click (review #58, defect 1). */}
      <Route path="/o/:orgId/*?">
        <Chrome>
          <Switch>
            {routes.map((r) => (
              <Route key={r.path} path={`/o/:orgId/${r.path}`}>
                {r.element}
              </Route>
            ))}
            <Route>
              <Redirect to="/" />
            </Route>
          </Switch>
        </Chrome>
      </Route>
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}
