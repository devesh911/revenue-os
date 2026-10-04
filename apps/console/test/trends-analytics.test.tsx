// The Analytics screen's Trends section (the 30-day daily series): it shows the series' values and honest
// loading, error and all-zero states, rendered on the server with the data hooks faked (mockModule). That the
// screen asks the worker's API for the series and shows what it reports is a browser test (e2e/screens.e2e.ts).
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import * as realScreensApi from "../src/features/screens/api";
import { mockModule, visible } from "./test-utils";

const RETIRED_COPY = "Time-series trends arrive with the analytics API.";
const ORG = "11111111-1111-4111-8111-111111111111";

type Query<T> = { data: T | undefined; isLoading: boolean; isError: boolean };
type TrendsData = {
  trends: Array<{
    day: string;
    new_leads: number;
    conversations_started: number;
    bookings: number;
  }>;
};

// 30 all-zero days — the honest-empty case (API returns rows, every value 0).
const ZERO_SERIES: TrendsData["trends"] = Array.from(
  { length: 30 },
  (_, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, "0")}`,
    new_leads: 0,
    conversations_started: 0,
    bookings: 0,
  }),
);
// Same series with ONE day carrying distinctive multi-digit values — proves the data reaches the DOM.
const DATA_SERIES: TrendsData["trends"] = ZERO_SERIES.map((d, i) =>
  i === 14
    ? { ...d, new_leads: 314, conversations_started: 88, bookings: 271 }
    : d,
);
const METRICS_OK = {
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

// ── mocked hooks + a static SSR router ──
let metricsState: Query<unknown>;
let trendsState: Query<TrendsData>;
let DashboardPage: () => ReactElement;

// The two fakes lie over the real exports (a dropped export breaks a sibling file, #71); afterAll
// restores the real module so no later file sees them.
const restoreScreens = mockModule(
  "../src/features/screens/api",
  realScreensApi,
  {
    useMetricsQuery: () => metricsState,
    useTrendsQuery: () => trendsState,
  },
);
beforeAll(async () => {
  DashboardPage = (await import("../src/pages/Dashboard")).DashboardPage;
});
afterAll(restoreScreens);

const renderDash = (): string =>
  renderToStaticMarkup(
    <Router ssrPath={`/o/${ORG}/dashboard`}>
      <Route path="/o/:orgId/dashboard">
        <DashboardPage />
      </Route>
    </Router>,
  );

// metricsState is held at success in every case so any Loading…/error/data evidence can ONLY come
// from the Trends section, never the metric tiles.
describe("Dashboard Trends section states", () => {
  it("loading → shows a loading affordance (the established DataShell 'Loading…')", () => {
    metricsState = METRICS_OK;
    trendsState = { data: undefined, isLoading: true, isError: false };
    const text = visible(renderDash());
    expect(text).toContain("Trends"); // the section label
    expect(text).toContain("Loading…"); // from Trends — metrics succeeded
  });

  it("error → shows an error affordance (the established DataShell 'Unable to load data.')", () => {
    metricsState = METRICS_OK;
    trendsState = { data: undefined, isLoading: false, isError: true };
    expect(visible(renderDash())).toContain("Unable to load data.");
  });

  it("all-zero → an honest empty state: not the retired copy, not loading, not error", () => {
    metricsState = METRICS_OK;
    trendsState = {
      data: { trends: ZERO_SERIES },
      isLoading: false,
      isError: false,
    };
    const text = visible(renderDash());
    expect(text).toContain("Trends");
    expect(text).not.toContain(RETIRED_COPY);
    expect(text).not.toContain("Loading…");
    expect(text).not.toContain("Unable to load data.");
  });

  it("data → the series values reach the DOM, and the placeholder copy is gone", () => {
    metricsState = METRICS_OK;
    trendsState = {
      data: { trends: DATA_SERIES },
      isLoading: false,
      isError: false,
    };
    const html = renderDash(); // raw markup — values may live in text OR accessible attributes
    expect(html).toContain("314"); // the distinctive new_leads value
    expect(html).toContain("271"); // the distinctive bookings value
    expect(visible(html)).not.toContain(RETIRED_COPY);
  });
});
