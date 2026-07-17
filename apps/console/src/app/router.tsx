// wouter routes behind the auth guard (S7.5). Org context lives in the URL (R7).
import { Link, Redirect, Route, Switch, useParams } from "wouter";
import { useOrgsQuery } from "../features/orgs/api";
import { API_URL } from "../lib/api";
import { getSupabase } from "../lib/supabase";
import { ContactTimeline, Dashboard, LiveMonitor, TaskQueue } from "../screens";
import { ConversationTranscript } from "../screens/transcript";
import { OrgHomeView } from "./OrgHomeView";
import { OrgSwitcher } from "./OrgSwitcher";

const SCREENS = [
  { path: "tasks", label: "Tasks", el: <TaskQueue /> },
  { path: "live", label: "Live", el: <LiveMonitor /> },
  { path: "contacts", label: "Contacts", el: <ContactTimeline /> },
  { path: "dashboard", label: "Dashboard", el: <Dashboard /> },
];

function OrgHome() {
  const { data: orgs, isLoading, isError } = useOrgsQuery();
  const first = orgs?.[0];
  if (first) return <Redirect to={`/o/${first.id}/tasks`} />;
  return (
    <OrgHomeView
      isLoading={isLoading}
      isError={isError}
      orgs={orgs}
      apiBase={API_URL}
    />
  );
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
            onClick={() => getSupabase().auth.signOut()}
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
      <Route
        path="/o/:orgId/conversations/:conversationId"
        component={ConversationTranscript}
      />
      <Route path="/o/:orgId/:screen" component={OrgLayout} />
      <Route path="/" component={OrgHome} />
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}
