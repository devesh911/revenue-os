// TASK B1-RED (wave 5 B) — DataShell adoption in the Home + Dashboard pages.
// The GREEN task rewrites pages/Home/index.tsx and pages/Dashboard/index.tsx to compose the
// DataShell primitive (ui/primitives) in place of the hand-rolled loading/error/empty branch,
// WITHOUT changing any visible copy or behavior. Neither page renders a <table> (both are Card
// grids), so the Table suite / local-TH-TD-collision pins do NOT apply here — see the report.
//
// This file mixes two kinds of case ON PURPOSE:
//   • SOURCE-adoption pins (RED on today's hand-rolled pages) — each page imports AND uses
//     <DataShell> and no longer hand-rolls the loading conditional. These FAIL now for the right
//     reason (assertion: DataShell absent / hand-rolled branch present) and pass once GREEN lands.
//   • VISIBLE-COPY characterization guards (GREEN today AND after) — the loading / error / empty /
//     happy copy each page renders TODAY, pinned so the refactor cannot silently change text.
//
// Env-free by construction (bun test + renderToStaticMarkup, no DOM library, no DB/network, no new
// deps) — imitates apps/console/test/ui-smoke.test.tsx and tests/console-boot-honesty.test.tsx.
// The query hooks are MOCKED via mock.module so the page renders each data state deterministically
// with no QueryClient, network, or env (the real features/screens/api pulls lib/api → import.meta.env).
import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { visible } from "./test-utils";

// CWD-relative, like tests/console-boot-honesty + apps/console/test/readme-coverage (suite runs
// from the repo/worktree root).
const HOME_SRC = "apps/console/src/pages/Home/index.tsx";
const DASH_SRC = "apps/console/src/pages/Dashboard/index.tsx";

// DataShell imported from the primitives barrel (the ONLY import surface pages may use).
const IMPORTS_DATASHELL =
  /import\s*\{[^}]*\bDataShell\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/ui\/primitives["']/;
// A hand-rolled loading branch in either of today's two forms: Dashboard's `isLoading ?` ternary
// or Home's `if (isLoading)` early return. Both vanish when DataShell owns the branch — the page
// then passes `isLoading={isLoading}`, which matches NEITHER alternative.
const HAND_ROLLED_LOADING = /isLoading\s*\?|if\s*\(\s*isLoading/;

// ---- behavior harness: mocked query hooks + a static SSR router ----
type QueryState = { data: unknown; isLoading: boolean; isError: boolean };
let convoState: QueryState;
let metricsState: QueryState;

beforeAll(() => {
  // Keyed by the path the PAGES import ("../../features/screens/api") — the same resolved module.
  mock.module("../src/features/screens/api", () => ({
    useConversationsQuery: () => convoState,
    useMetricsQuery: () => metricsState,
    queryKeys: {
      tasks: () => [],
      contacts: () => [],
      conversations: () => [],
      metrics: () => [],
    },
  }));
});
// mock.module is process-global — restore so the fake api never leaks into another test file.
afterAll(() => mock.restore());

function renderPage(ssrPath: string, pattern: string, node: ReactNode): string {
  return renderToStaticMarkup(
    <Router ssrPath={ssrPath}>
      <Route path={pattern}>{node}</Route>
    </Router>,
  );
}
const homeAt = (node: ReactNode): string =>
  renderPage("/o/org-1/home", "/o/:orgId/home", node);
const dashAt = (node: ReactNode): string =>
  renderPage("/o/org-1/dashboard", "/o/:orgId/dashboard", node);

async function loadHome() {
  return (await import("../src/pages/Home/index")).HomePage;
}
async function loadDashboard() {
  return (await import("../src/pages/Dashboard/index")).DashboardPage;
}

// ─────────────────────────────── SOURCE-adoption pins (RED today) ───────────────────────────────

describe("Home — DataShell adoption (source · RED on today's hand-rolled page)", () => {
  it("imports DataShell from the ui/primitives barrel", async () => {
    expect(await Bun.file(HOME_SRC).text()).toMatch(IMPORTS_DATASHELL);
  });

  it("renders <DataShell> in place of a hand-rolled state branch", async () => {
    expect(await Bun.file(HOME_SRC).text()).toMatch(/<DataShell\b/);
  });

  it("keeps no hand-rolled loading conditional (no `if (isLoading)` / `isLoading ?`)", async () => {
    expect(await Bun.file(HOME_SRC).text()).not.toMatch(HAND_ROLLED_LOADING);
  });
});

describe("Dashboard — DataShell adoption (source · RED on today's ternary)", () => {
  it("imports DataShell from the ui/primitives barrel", async () => {
    expect(await Bun.file(DASH_SRC).text()).toMatch(IMPORTS_DATASHELL);
  });

  it("renders <DataShell> in place of a hand-rolled state branch", async () => {
    expect(await Bun.file(DASH_SRC).text()).toMatch(/<DataShell\b/);
  });

  it("keeps no hand-rolled state ternary (no `isLoading ?`)", async () => {
    expect(await Bun.file(DASH_SRC).text()).not.toMatch(HAND_ROLLED_LOADING);
  });
});

// ─────────────── VISIBLE-COPY characterization guards (GREEN today AND after GREEN) ───────────────
// These pin the exact copy the pages render TODAY, so the DataShell refactor cannot change any
// visible text. Home's error/empty copy differ from DataShell's defaults, so GREEN must pass
// errorText/emptyText overrides — a miss surfaces here as a copy regression.

describe("Home — visible copy is preserved across the refactor (characterization)", () => {
  it("loading: shows 'Loading…' while the hero + shortcuts stay visible", async () => {
    const HomePage = await loadHome();
    convoState = { data: undefined, isLoading: true, isError: false };
    const text = visible(homeAt(<HomePage />));
    expect(text).toContain("Loading…");
    expect(text).toContain("Welcome back"); // hero is not gated behind the data branch
    expect(text).toContain("Review open tasks"); // a shortcut chip stays live
  });

  it("error: shows the page's exact 'Unable to load recent conversations.' copy", async () => {
    const HomePage = await loadHome();
    convoState = { data: undefined, isLoading: false, isError: true };
    const text = visible(homeAt(<HomePage />));
    expect(text).toContain("Unable to load recent conversations.");
    expect(text).not.toContain("Loading…");
  });

  it("empty: shows the page's exact 'No conversations yet …' copy", async () => {
    const HomePage = await loadHome();
    convoState = {
      data: { conversations: [] },
      isLoading: false,
      isError: false,
    };
    const text = visible(homeAt(<HomePage />));
    // split around the em-dash + apostrophe (HTML-escaped) — pins the load-bearing words
    expect(text).toContain("No conversations yet");
    expect(text).toContain("appear here as your agents start talking.");
  });

  it("happy: renders greeting, subtitle, every shortcut chip, the section, and a conversation", async () => {
    const HomePage = await loadHome();
    convoState = {
      data: {
        conversations: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            channel: "voice",
            status: "active",
            direction: "outbound",
            contact_name: "Ada Lovelace",
            started_at: "2026-07-01T00:00:00Z",
            ended_at: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    };
    const text = visible(homeAt(<HomePage />));
    expect(text).toContain("Welcome back");
    expect(text).toContain("Ask for anything, or jump back into the pipeline.");
    for (const chip of [
      "Review open tasks",
      "Watch live conversations",
      "Browse contacts",
      "Check performance",
    ]) {
      expect(text).toContain(chip);
    }
    expect(text).toContain("Recent conversations"); // the Section label
    expect(text).toContain("Ada Lovelace"); // the continue card's contact
    expect(text).toContain("active"); // its status badge
    expect(text).toContain("voice"); // its channel
    expect(text).not.toContain("Loading…");
    expect(text).not.toContain("Unable to load recent conversations.");
  });
});

const METRIC_LABELS = [
  "New leads",
  "Conversations started",
  "Conversations completed",
  "Qualified",
  "Bookings",
  "Open tasks",
];

describe("Dashboard — visible copy is preserved across the refactor (characterization)", () => {
  it("loading: shows 'Loading…' with the title + Trends still visible", async () => {
    const DashboardPage = await loadDashboard();
    metricsState = { data: undefined, isLoading: true, isError: false };
    const text = visible(dashAt(<DashboardPage />));
    expect(text).toContain("Loading…");
    expect(text).toContain("Analytics"); // PageHeader title
    expect(text).toContain("Trends"); // Trends section is not gated behind the data branch
  });

  it("error: shows the page's exact 'Unable to load data.' copy", async () => {
    const DashboardPage = await loadDashboard();
    metricsState = { data: undefined, isLoading: false, isError: true };
    const text = visible(dashAt(<DashboardPage />));
    expect(text).toContain("Unable to load data.");
    expect(text).not.toContain("New leads"); // the metric grid is hidden on error
  });

  it("happy: renders every metric label, the metric values, the notes, title and Trends", async () => {
    const DashboardPage = await loadDashboard();
    metricsState = {
      data: {
        metrics: {
          new_leads: 42,
          conversations_started: 5,
          conversations_completed: 3,
          qualified: 2,
          bookings: 7,
          open_tasks: 137,
        },
      },
      isLoading: false,
      isError: false,
    };
    const text = visible(dashAt(<DashboardPage />));
    for (const label of METRIC_LABELS) expect(text).toContain(label);
    expect(text).toContain("42"); // new_leads value proves the data path renders
    expect(text).toContain("137"); // open_tasks value
    expect(text).toContain("Last 30 days"); // 30-day window note
    expect(text).toContain("All time"); // open_tasks note
    expect(text).toContain("Analytics");
    expect(text).toContain("Trends");
    expect(text).toContain("Time-series trends arrive with the analytics API.");
    expect(text).not.toContain("Loading…");
    expect(text).not.toContain("Unable to load data.");
  });
});
