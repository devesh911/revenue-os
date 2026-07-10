// wouter routes behind the auth guard (S7.5). Org context lives in the URL (R7).
import { Link, Redirect, Route, Switch, useParams } from "wouter";
import { useOrgsQuery } from "../features/orgs/api";
import { supabase } from "../lib/supabase";
import { ContactTimeline, Dashboard, LiveMonitor, TaskQueue } from "../screens";
import { OrgSwitcher } from "./OrgSwitcher";

const SCREENS = [
  { path: "tasks", label: "Tasks", el: <TaskQueue /> },
  { path: "live", label: "Live", el: <LiveMonitor /> },
  { path: "contacts", label: "Contacts", el: <ContactTimeline /> },
  { path: "dashboard", label: "Dashboard", el: <Dashboard /> },
];

function OrgHome() {
  const { data: orgs, isLoading } = useOrgsQuery();
  if (isLoading)
    return <div className="p-8 text-sm text-gray-500">Loading orgs…</div>;
  const first = orgs?.[0];
  if (!first)
    return (
      <div className="p-8 text-sm text-gray-500">
        No orgs yet — create one via the API (console org-create UI lands in
        P3).
      </div>
    );
  return <Redirect to={`/o/${first.id}/tasks`} />;
}

function OrgLayout() {
  const params = useParams<{ orgId: string; screen: string }>();
  const active = SCREENS.find((s) => s.path === params.screen) ?? SCREENS[0];
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center gap-6 border-b bg-white px-6 py-3">
        <span className="font-semibold">Revenue OS</span>
        <nav className="flex gap-4">
          {SCREENS.map((s) => (
            <Link
              key={s.path}
              href={`/o/${params.orgId}/${s.path}`}
              className={
                s.path === active?.path
                  ? "text-sm font-medium"
                  : "text-sm text-gray-500"
              }
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <OrgSwitcher />
          <button
            type="button"
            className="text-xs text-gray-500"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      {active?.el}
    </div>
  );
}

export function Router() {
  return (
    <Switch>
      <Route path="/o/:orgId/:screen" component={OrgLayout} />
      <Route path="/" component={OrgHome} />
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}
