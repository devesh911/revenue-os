// task-32 page-fleet adoption · B3-RED — Tasks + Settings adopt the DataShell/Table primitives
// (ui/README.md "page skeleton"); Agents STAYS an honest static shell. Test-is-spec.
//
// This file mixes RED and GREEN on purpose (imitates tests/console-boot-honesty.test.tsx):
//   • SOURCE pins (RED today) — Tasks imports DataShell + the Table suite from the barrel and drops
//     its hand-rolled ternary + local TH/TD class consts (TS2451: those collide with the imports);
//     Settings' OrganizationCard replaces its isLoading/isError guards with <DataShell>.
//   • Agents HONESTY guard (GREEN today, MUST stay green) — the /agents endpoint isn't live, so the
//     page has NO data source: it must never import DataShell or grow a loading/error/empty branch.
//   • BEHAVIOR pins — today's loading/error/empty copy and happy-path strings per page, preserved
//     across the refactor (copy is identical everywhere). One is RED-until-Table: Tasks headers
//     become semantic <th scope="col"> only once the Table primitive lands.
//
// Env-free by construction (bun test + renderToStaticMarkup, no DOM library, no DB/network, no new
// deps): the two server-state hooks are MOCKED via mock.module so no QueryClient/provider is needed,
// and a real wouter <Router>/<Route> supplies useParams — exactly the seams the boot-honesty and
// contact-link suites already use. mock.module is process-global, so afterAll restores it.
import { afterAll, describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";

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

// Reusable query-hook return shapes. `ok(data)` = success; the three states below are the non-happy
// branches every DataShell adoption must keep honest.
const loadingState = { isLoading: true, isError: false, data: undefined };
const errorState = { isLoading: false, isError: true, data: undefined };
const noDataState = { isLoading: false, isError: false, data: undefined };
const ok = (data: unknown) => ({ isLoading: false, isError: false, data });

// The mocked hooks read these live, so each behavior test just assigns before it renders.
let tasksResult: unknown = noDataState;
let orgsResult: unknown = noDataState;

mock.module("../src/features/screens/api", () => ({
  useTasksQuery: () => tasksResult,
}));
mock.module("../src/features/orgs/api", () => ({
  useOrgsQuery: () => orgsResult,
}));

afterAll(() => {
  mock.restore();
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

const readSrc = (path: string): Promise<string> => Bun.file(path).text();

// The identifiers imported from the primitives barrel (`from "../../ui/primitives"`), as exact
// tokens — so `.toContain("TH")` never matches the "THead" substring.
const barrelNames = (src: string): string[] => {
  const m = src.match(
    /import\s*\{([^}]*)\}\s*from\s*["']\.\.\/\.\.\/ui\/primitives["']/,
  );
  const inner = m?.[1];
  return inner
    ? inner
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
};

const TASKS_SRC = "apps/console/src/pages/Tasks/index.tsx";
const SETTINGS_SRC = "apps/console/src/pages/Settings/index.tsx";
const AGENTS_SRC = "apps/console/src/pages/Agents/index.tsx";

// ── SOURCE PINS ─────────────────────────────────────────────────────────────────────────────────

describe("Tasks — adopts DataShell + the Table suite (source)", () => {
  it("imports DataShell from the primitives barrel", async () => {
    // RED today: Tasks imports only { Badge, Card } from the barrel.
    expect(barrelNames(await readSrc(TASKS_SRC))).toContain("DataShell");
  });

  it("imports the Table suite (Table, THead, TH, Row, TD) from the barrel", async () => {
    const names = barrelNames(await readSrc(TASKS_SRC));
    // RED today: the page hand-rolls <table>/<thead>/<th>/<tr>/<td>, importing none of these.
    for (const n of ["Table", "THead", "TH", "Row", "TD"]) {
      expect(names).toContain(n);
    }
  });

  it("uses <DataShell> in place of the hand-rolled loading/error/empty ternary", async () => {
    const src = await readSrc(TASKS_SRC);
    expect(src).toContain("<DataShell"); // RED today
    expect(src).not.toMatch(/isLoading\s*\?/); // RED today: `{isLoading ? (` opens the ternary
  });

  it("deletes the local TH/TD class constants (they'd collide with the imports — TS2451)", async () => {
    const src = await readSrc(TASKS_SRC);
    expect(src).not.toMatch(/const\s+TH\s*=/); // RED today: `const TH = "…"`
    expect(src).not.toMatch(/const\s+TD\s*=/); // RED today: `const TD = "…"`
  });
});

describe("Settings — OrganizationCard adopts DataShell (source)", () => {
  it("imports DataShell from the primitives barrel", async () => {
    // RED today: Settings imports only { Badge, Card }.
    expect(barrelNames(await readSrc(SETTINGS_SRC))).toContain("DataShell");
  });

  it("replaces the isLoading/isError guard-returns with <DataShell>", async () => {
    const src = await readSrc(SETTINGS_SRC);
    expect(src).toContain("<DataShell"); // RED today
    expect(src).not.toMatch(/if\s*\(\s*isLoading\s*\)/); // RED today: `if (isLoading) return …`
    expect(src).not.toMatch(/if\s*\(\s*isError/); // RED today: `if (isError || !data) return …`
  });
});

describe("Agents — honest static shell: NO DataShell, NO data-state code (source)", () => {
  it("does NOT import or reference DataShell (no data source ⇒ no fake loading/empty states)", async () => {
    // GREEN today and MUST stay green: adopting DataShell here would fabricate states with no data.
    expect(await readSrc(AGENTS_SRC)).not.toMatch(/\bDataShell\b/);
  });

  it("carries no query hook and no isLoading/isError/isEmpty branch", async () => {
    const src = await readSrc(AGENTS_SRC);
    expect(src).not.toMatch(/use\w*Query/); // no server-state hook
    expect(src).not.toContain("isLoading");
    expect(src).not.toContain("isError");
    expect(src).not.toContain("isEmpty");
  });

  it("imports nothing from features/* (it renders no server data)", async () => {
    expect(await readSrc(AGENTS_SRC)).not.toMatch(
      /from\s+["'][^"']*\/features\//,
    );
  });
});

// ── BEHAVIOR PINS ───────────────────────────────────────────────────────────────────────────────

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
  });

  it('RED until the Table primitive lands: headers are semantic <th scope="col">', async () => {
    tasksResult = ok({ tasks: [taskLinked] });
    // RED today: the hand-rolled `<th className={TH}>` carries no scope. The Table primitive's <TH>
    // renders `scope="col"`, so this passes only after adoption.
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

describe("Agents — honest static shell copy (no hooks, no mocks)", () => {
  const render = async (): Promise<string> => {
    const { AgentsPage } = await import("../src/pages/Agents/index");
    return renderToStaticMarkup(<AgentsPage />);
  };

  it("renders the page title and description", async () => {
    const t = text(await render());
    expect(t).toContain("Agents");
    expect(t).toContain("Voice & messaging agents and their workflows");
  });

  it("explains itself instead of faking data", async () => {
    const t = text(await render());
    expect(t).toContain("Agent management isn't in the console yet");
    expect(t).toContain("/agents endpoint isn't live");
    expect(t).toContain("list each agent and its workflow versions");
  });

  it("shows NO loading/error/empty state copy (honesty: there is no data source)", async () => {
    const t = text(await render());
    expect(t).not.toContain("Loading…");
    expect(t).not.toContain("Unable to load");
    expect(t).not.toContain("Nothing here yet.");
  });
});
