// What the Tasks, Settings (its organization card) and Agents pages show while loading, on an error, with no data
// and with data: rendered on the server (renderToStaticMarkup) inside a real wouter Router, which supplies the
// page's :orgId, with the data hooks faked through mockModule, so no network or settings are needed. mock.module
// is process-wide, so afterAll restores the real modules.
import { afterAll, describe, expect, it } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import * as realAgentsApi from "../src/features/agents/api";
import * as realGuardrailsApi from "../src/features/guardrails/api";
import * as realOrgsApi from "../src/features/orgs/api";
import * as realScreensApi from "../src/features/screens/api";
import { mockModule } from "./test-utils";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const CONV = "22222222-2222-4222-8222-222222222222";

// Two tasks pin both branches: `taskLinked` (open → accent badge, deep-linked title, real priority/
// due) and `taskPlain` (done → neutral badge, null conversation → plain-text title, null priority/
// due → the "—" fallback). Shapes mirror TasksResponse["tasks"][number].
const taskLinked = {
  id: "33333333-3333-4333-8333-333333333333",
  kind: "callback",
  status: "open",
  priority: 3,
  title: "Call Ada back",
  contact_id: null,
  conversation_id: CONV,
  due_at: "2026-07-30",
  created_at: "2026-07-01T00:00:00Z",
};
const taskPlain = {
  id: "44444444-4444-4444-8444-444444444444",
  kind: "review",
  status: "done",
  priority: null,
  title: "Send recap",
  contact_id: null,
  conversation_id: null,
  due_at: null,
  created_at: "2026-07-02T00:00:00Z",
};
const orgFixture = { id: ORG, name: "Acme Co", slug: "acme", role: "admin" };
const otherOrg = {
  id: OTHER_ORG,
  name: "Other",
  slug: "other",
  role: "viewer",
};

// The lean agents and workflows rows AgentsPage lists. Version digits (7 and 9) are chosen
// collision-free vs the uuids ({4,8}), model ({4,6}) and dates ({0,1,2,6}) so a bare toContain on a
// version can't match another field (the pattern pages-adoption-home-dashboard uses for "42"/"137").
const agentFixture = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  key: "receptionist",
  version: 7,
  status: "active",
  model: "claude-sonnet-4-6",
  created_at: "2026-01-02T00:00:00Z",
};
const workflowFixture = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  key: "inbound-triage",
  version: 9,
  status: "draft",
  created_at: "2026-01-02T00:00:00Z",
};

// Reusable query-hook return shapes. `ok(data)` = success; the three states below are the non-happy
// branches every DataShell adoption must keep honest.
const loadingState = { isLoading: true, isError: false, data: undefined };
const errorState = { isLoading: false, isError: true, data: undefined };
const noDataState = { isLoading: false, isError: false, data: undefined };
const ok = (data: unknown) => ({ isLoading: false, isError: false, data });

// The mocked hooks read these live, so each behavior test just assigns before it renders.
let tasksResult: unknown = noDataState;
let orgsResult: unknown = noDataState;
let agentsResult: unknown = noDataState;

// SPREAD the real module, override only the one hook (Bun's mock.module is process-global): a
// bare `{ useTasksQuery }` factory drops the module's sibling exports (useContactsQuery,
// useConversationsQuery, queryKeys, …) and kills any other test file that imports them — the
// exact regression that broke PR #71's merged run.
const restoreScreens = mockModule(
  "../src/features/screens/api",
  realScreensApi,
  {
    useTasksQuery: () => tasksResult,
  },
);
const restoreOrgs = mockModule("../src/features/orgs/api", realOrgsApi, {
  useOrgsQuery: () => orgsResult,
});
// SettingsPage's live Guardrails section calls useGuardrailPoliciesQuery — hold it in
// loading so these OrganizationCard renders stay isolated (loading's only copy, "Loading…",
// collides with none of the org assertions below). SPREAD the real module (same rule as
// screens/orgs/agents): a bare factory drops sibling exports process-wide — the PR #71 class.
const restoreGuardrails = mockModule(
  "../src/features/guardrails/api",
  realGuardrailsApi,
  {
    useGuardrailPoliciesQuery: () => ({
      isLoading: true,
      isError: false,
      data: undefined,
    }),
    useUpdateGuardrailPolicy: () => ({ mutate: () => {}, isPending: false }),
  },
);
// SPREAD the real module (same reason as screens/orgs above): a bare `{ useAgentsQuery }` factory
// drops the module's sibling exports (queryKeys, AgentsResponse) process-wide and breaks
// agents-api-hook.test.ts in a combined run — the PR #71 regression class.
const restoreAgents = mockModule("../src/features/agents/api", realAgentsApi, {
  useAgentsQuery: () => agentsResult,
});

afterAll(() => {
  restoreScreens();
  restoreOrgs();
  restoreGuardrails();
  restoreAgents();
});

// strip tags → visible text, then decode the entities renderToStaticMarkup emits (' → &#x27;,
// & → &amp;) so copy assertions with apostrophes/ampersands match the human string.
const text = (html: string): string =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

// The class tokens of the <td> whose markup contains `needle` — lets a test inspect ONE cell's
// color when the page as a whole carries both text-ink (title cell) and text-ink-soft (the rest).
const cellClasses = (html: string, needle: string): string[] => {
  const cell = (html.match(/<td\b[^>]*>.*?<\/td>/gs) ?? []).find((c) =>
    c.includes(needle),
  );
  return cell?.match(/class="([^"]*)"/)?.[1]?.split(/\s+/) ?? [];
};

// Render a page inside a static SSR Router at a route that carries :orgId, so useParams resolves.
function renderInRouter(
  ssrPath: string,
  pattern: string,
  node: ReactNode,
): string {
  return renderToStaticMarkup(
    <Router ssrPath={ssrPath}>
      <Route path={pattern}>{node}</Route>
    </Router>,
  );
}

describe("Tasks — state behavior preserved (mocked useTasksQuery)", () => {
  const render = async (): Promise<string> => {
    const { TasksPage } = await import("../src/pages/Tasks/index");
    return renderInRouter(`/o/${ORG}/tasks`, "/o/:orgId/tasks", <TasksPage />);
  };

  it("loading → calm muted 'Loading…', no table drawn", async () => {
    tasksResult = loadingState;
    const html = await render();
    expect(text(html)).toContain("Loading…");
    expect(html).not.toContain("<table");
  });

  it("error → 'Unable to load data.'", async () => {
    tasksResult = errorState;
    expect(text(await render())).toContain("Unable to load data.");
  });

  it("no data (not error) reads as unavailable, never as empty", async () => {
    tasksResult = noDataState;
    const t = text(await render());
    expect(t).toContain("Unable to load data.");
    expect(t).not.toContain("No tasks.");
  });

  it("empty list → 'No tasks.'", async () => {
    tasksResult = ok({ tasks: [] });
    expect(text(await render())).toContain("No tasks.");
  });

  it("happy path → the five column headers", async () => {
    tasksResult = ok({ tasks: [taskLinked, taskPlain] });
    const t = text(await render());
    for (const h of ["Title", "Kind", "Status", "Priority", "Due"]) {
      expect(t).toContain(h);
    }
  });

  it("happy path → row fields, deep-linked title, and the '—' fallbacks", async () => {
    tasksResult = ok({ tasks: [taskLinked, taskPlain] });
    const html = await render();
    const t = text(html);
    expect(t).toContain("Call Ada back");
    expect(t).toContain("callback");
    expect(t).toContain("open");
    expect(html).toContain(`href="/o/${ORG}/conversations/${CONV}"`); // linked title
    expect(t).toContain("Send recap"); // null-conversation title stays plain text
    expect(t).toContain("—"); // null priority / due_at fallback
    // the title cell restores TD_TITLE's ink: TD tone="ink" emits text-ink and NOT text-ink-soft
    // (the both-classes cascade collision this round fixes). Isolate it — the page carries both.
    const titleClasses = cellClasses(html, "Call Ada back");
    expect(titleClasses).toContain("text-ink");
    expect(titleClasses).not.toContain("text-ink-soft");
  });

  // behaviour already on main: only its name and comment changed (the old "RED until" label dropped); main's Tasks page already has these headers
  it('headers are semantic <th scope="col"> (the Table primitive)', async () => {
    tasksResult = ok({ tasks: [taskLinked] });
    expect(await render()).toContain('scope="col"');
  });
});

describe("Settings — OrganizationCard state behavior preserved (mocked useOrgsQuery)", () => {
  const render = async (): Promise<string> => {
    const { SettingsPage } = await import("../src/pages/Settings/index");
    return renderInRouter(
      `/o/${ORG}/settings`,
      "/o/:orgId/settings",
      <SettingsPage />,
    );
  };

  it("loading → 'Loading…'", async () => {
    orgsResult = loadingState;
    expect(text(await render())).toContain("Loading…");
  });

  it("error → the org-specific 'Unable to load organization.', not the generic default", async () => {
    orgsResult = errorState;
    const t = text(await render());
    expect(t).toContain("Unable to load organization.");
    expect(t).not.toContain("Unable to load data."); // custom errorText must survive adoption
  });

  it("no data (not error) reads as unavailable, not silently blank", async () => {
    orgsResult = noDataState;
    expect(text(await render())).toContain("Unable to load organization.");
  });

  it("org absent from the caller's list → honest 'This organization isn't in your list.'", async () => {
    orgsResult = ok([otherOrg]);
    expect(text(await render())).toContain(
      "This organization isn't in your list.",
    );
  });

  it("happy path → name, slug and role of the matched org", async () => {
    orgsResult = ok([orgFixture]);
    const t = text(await render());
    expect(t).toContain("Name");
    expect(t).toContain("Acme Co");
    expect(t).toContain("Slug");
    expect(t).toContain("acme");
    expect(t).toContain("Your role");
    expect(t).toContain("admin");
  });
});

describe("Agents — data-state behavior (mocked useAgentsQuery)", () => {
  // Renders inside an SSR Router at a :orgId route so useParams resolves (mirrors Tasks above); the
  // mocked useAgentsQuery reads `agentsResult`, so each test assigns before it renders.
  const render = async (): Promise<string> => {
    const { AgentsPage } = await import("../src/pages/Agents/index");
    return renderInRouter(
      `/o/${ORG}/agents`,
      "/o/:orgId/agents",
      <AgentsPage />,
    );
  };

  it("loading → 'Loading…', no rows drawn", async () => {
    agentsResult = loadingState;
    const html = await render();
    expect(text(html)).toContain("Loading…");
    expect(html).not.toContain("receptionist");
  });

  it("error → 'Unable to load data.'", async () => {
    agentsResult = errorState;
    expect(text(await render())).toContain("Unable to load data.");
  });

  it("no data (not error) reads as unavailable, never as empty", async () => {
    agentsResult = noDataState;
    const t = text(await render());
    expect(t).toContain("Unable to load data.");
    expect(t).not.toContain("No agents");
  });

  it("zero agents → honest empty state; the retired 'endpoint isn't live' copy is gone", async () => {
    agentsResult = ok({ agents: [], workflows: [] });
    const t = text(await render());
    expect(t).toContain("No agents"); // honest empty, not a fabricated list
    expect(t).not.toContain("isn't live");
    expect(t).not.toContain("isn't in the console yet");
  });

  it("happy path → the agent row and the workflow row, each with its lean fields", async () => {
    agentsResult = ok({ agents: [agentFixture], workflows: [workflowFixture] });
    const t = text(await render());
    // agents list: key, status, model, version
    expect(t).toContain("receptionist");
    expect(t).toContain("active");
    expect(t).toContain("claude-sonnet-4-6");
    expect(t).toContain("7"); // agent version (collision-free digit)
    // workflows list: key, status, version — proves the second list renders too
    expect(t).toContain("inbound-triage");
    expect(t).toContain("draft");
    expect(t).toContain("9"); // workflow version (collision-free digit)
    expect(t).not.toContain("Loading…");
    expect(t).not.toContain("Unable to load data.");
  });
});
