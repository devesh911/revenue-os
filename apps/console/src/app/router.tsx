// wouter routes. /login is public, OUTSIDE the session gate; every other route sits behind it
// (docs/security.md S7.5), and the org-scoped shell additionally behind the membership gate. Org
// context lives in the URL, not a global store. The route table is src/routes.tsx — the Switch
// below AND the AppShell sidebar both read it, so pages register once. Sign-out stays HERE (not in ui/) so ui/ stays
// Supabase-free.
import type { ReactNode } from "react";
import { Redirect, Route, Switch } from "wouter";
import { useOrgsQuery } from "../features/orgs/api";
import { routes } from "../routes";
import { AppShell } from "../ui/layout/AppShell";
import { Button } from "../ui/primitives";
import { OrgGate, OrgsStatus } from "./access/OrgGate";
import { OrgSwitcher } from "./OrgSwitcher";
import { LoginPage } from "./session/LoginPage";
import { RequireSession } from "./session/RequireSession";
import { useSession } from "./session/SessionProvider";
import { UserChip } from "./UserChip";

const NAV = routes.filter((r) => !r.hidden);

// The landing: straight on to the first workspace (by name, see packages/db userOrgs), else an
// honest empty / error state.
function OrgHome() {
  const first = useOrgsQuery().data?.[0];
  if (first) return <Redirect replace to={`/o/${first.id}/home`} />;
  return <OrgsStatus />;
}

function Chrome({ children }: { children: ReactNode }) {
  const { signOut } = useSession();
  return (
    <AppShell
      nav={NAV}
      actions={
        <>
          <OrgSwitcher />
          <Button variant="secondary" size="sm" onClick={signOut}>
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
      <Route path="/login" component={LoginPage} />
      <Route>
        <RequireSession>
          <Switch>
            <Route path="/" component={OrgHome} />
            {/* ONE org-scoped route hosts the shell, so AppShell (sidebar/topbar/user chip)
                mounts once and persists across page navigations — only the inner Switch swaps
                the content pane. Per-page <Route> wrappers here would remount the whole shell
                on every click (review #58, defect 1). */}
            <Route path="/o/:orgId/*?">
              <OrgGate>
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
              </OrgGate>
            </Route>
            <Route>
              <Redirect to="/" />
            </Route>
          </Switch>
        </RequireSession>
      </Route>
    </Switch>
  );
}
