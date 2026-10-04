// What the Home and Analytics (Dashboard) pages show while loading, on an error, with no data and with data, in
// each page's own words: rendered on the server (renderToStaticMarkup) with the data hooks faked (mockModule), so
// no network or settings are needed.
import { afterAll, describe, expect, it } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import * as realScreensApi from "../src/features/screens/api";
import { mockModule, visible } from "./test-utils";

// ---- behavior harness: mocked query hooks + a static SSR router ----
type QueryState = { data: unknown; isLoading: boolean; isError: boolean };
let convoState: QueryState;
let metricsState: QueryState;
// The Dashboard also draws a Trends section from useTrendsQuery; each Dashboard case sets its state too.
let trendsState: QueryState;

// Keyed by the path the PAGES import ("../../features/screens/api") — the same resolved module.
// The fakes lie over the real exports, and afterAll restores the real module for later files.
const restoreScreens = mockModule(
  "../src/features/screens/api",
  realScreensApi,
  {
    useConversationsQuery: () => convoState,
    useMetricsQuery: () => metricsState,
    useTrendsQuery: () => trendsState,
  },
);
afterAll(restoreScreens);

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

// The exact copy each page renders. Home's error and empty copy differ from DataShell's defaults, so the page
// passes its own errorText and emptyText.

describe("Home — loading, error, empty and data copy", () => {
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

describe("Dashboard — loading, error and data copy", () => {
  it("loading: shows 'Loading…' with the title + Trends still visible", async () => {
    const DashboardPage = await loadDashboard();
    metricsState = { data: undefined, isLoading: true, isError: false };
    trendsState = { data: undefined, isLoading: true, isError: false };
    const text = visible(dashAt(<DashboardPage />));
    expect(text).toContain("Loading…");
    expect(text).toContain("Analytics"); // PageHeader title
    expect(text).toContain("Trends"); // Trends section is not gated behind the data branch
  });

  it("error: shows the page's exact 'Unable to load data.' copy", async () => {
    const DashboardPage = await loadDashboard();
    metricsState = { data: undefined, isLoading: false, isError: true };
    trendsState = { data: undefined, isLoading: false, isError: true };
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
    // trends empty (all-zero) → the section shows its honest note, never loading/error/placeholder,
    // so every stat-tile pin below stays byte-identical.
    trendsState = { data: { trends: [] }, isLoading: false, isError: false };
    const text = visible(dashAt(<DashboardPage />));
    for (const label of METRIC_LABELS) expect(text).toContain(label);
    expect(text).toContain("42"); // new_leads value proves the data path renders
    expect(text).toContain("137"); // open_tasks value
    expect(text).toContain("Last 30 days"); // 30-day window note
    expect(text).toContain("All time"); // open_tasks note
    expect(text).toContain("Analytics");
    expect(text).toContain("Trends");
    // The retired placeholder copy is gone; the Trends section's own states are in trends-analytics.test.tsx.
    expect(text).not.toContain(
      "Time-series trends arrive with the analytics API.",
    );
    expect(text).not.toContain("Loading…");
    expect(text).not.toContain("Unable to load data.");
  });
});
