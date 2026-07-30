// Task 51 RED — the console side of the Analytics "Trends" 30-day series. Two kinds of case:
//   • SOURCE contract (Bun.file reads): features/screens/api.ts grows useTrendsQuery mirroring
//     useMetricsQuery exactly (R2/R6 — a `trends` queryKeys entry + a local Zod TrendsResponse whose
//     infer is the hook's data type), and the Dashboard page adopts it, retiring the placeholder copy.
//   • BEHAVIOR (mocked hooks + SSR render of the REAL Dashboard): the Trends section renders the
//     series with honest loading / error / all-zero-empty / data states. Assertions pin data presence
//     and honest states via stable text — NOT pixel layout or an invented empty-note wording.
// Env-free by construction (bun test + renderToStaticMarkup + Bun.file, no DOM lib / DB / network /
// new deps) — imitates apps/console/test/pages-adoption-behavior.test.tsx.
import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import * as realScreensApi from "../src/features/screens/api";
import { visible } from "./test-utils";

const API_SRC = "apps/console/src/features/screens/api.ts";
const DASH_SRC = "apps/console/src/pages/Dashboard/index.tsx";
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

// ── behavior harness: mocked hooks + a static SSR router (the pages-adoption-behavior precedent) ──
let metricsState: Query<unknown>;
let trendsState: Query<TrendsData>;
let DashboardPage: () => ReactElement;

beforeAll(async () => {
  // Spread the real module first, override only the two hooks — else a sibling that imports another
  // export fails to link once the suites run merged (pages-adoption-behavior #71).
  mock.module("../src/features/screens/api", () => ({
    ...realScreensApi,
    useMetricsQuery: () => metricsState,
    useTrendsQuery: () => trendsState,
  }));
  DashboardPage = (await import("../src/pages/Dashboard")).DashboardPage;
});
afterAll(() => mock.restore()); // mock.module is process-global — restore so no other file sees the fakes

const renderDash = (): string =>
  renderToStaticMarkup(
    <Router ssrPath={`/o/${ORG}/dashboard`}>
      <Route path="/o/:orgId/dashboard">
        <DashboardPage />
      </Route>
    </Router>,
  );

// ─────────────────────────── SOURCE contract (RED on today's api.ts / page) ───────────────────────────
describe("features/screens/api.ts: useTrendsQuery mirrors useMetricsQuery (R2/R6)", () => {
  let src: string;
  beforeAll(async () => {
    src = await Bun.file(API_SRC).text();
  });

  it("exports a useTrendsQuery hook hitting GET /orgs/:orgId/metrics/trends", () => {
    expect(src).toMatch(/export function useTrendsQuery/);
    expect(src).toMatch(/\/orgs\/\$\{orgId\}\/metrics\/trends/);
  });

  it('adds a `trends` queryKeys entry keyed ["trends", orgId]', () => {
    expect(src).toMatch(
      /trends:\s*\(orgId[^)]*\)\s*=>\s*\["trends",\s*orgId\]/,
    );
  });

  it("defines a local Zod TrendsResponse whose infer is the data type (R6)", () => {
    expect(src).toMatch(/const TrendsResponse = z\.object/);
    expect(src).toMatch(
      /export type TrendsResponse = z\.infer<typeof TrendsResponse>/,
    );
    for (const field of [
      "day",
      "new_leads",
      "conversations_started",
      "bookings",
    ]) {
      expect(src).toContain(field);
    }
  });
});

describe("pages/Dashboard: adopts useTrendsQuery, retires the placeholder copy", () => {
  let src: string;
  beforeAll(async () => {
    src = await Bun.file(DASH_SRC).text();
  });

  it("imports and uses useTrendsQuery", () => {
    expect(src).toMatch(/useTrendsQuery/);
  });

  it("no longer renders the retired placeholder copy", () => {
    expect(src).not.toContain(RETIRED_COPY);
  });
});

// ─────── BEHAVIOR: the Trends section renders the series + honest states (RED on today's page) ───────
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
