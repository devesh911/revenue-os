// Analytics (route surface /o/:orgId/dashboard, sidebar label "Analytics") — rebuilt
// on the design system: PageHeader + a responsive grid of stat Cards fed by
// useMetricsQuery (features/screens/api.ts — R2, Zod-parsed). Counts are 30-day
// windows except open_tasks, which is all-time. The Trends section renders the
// 30-day daily series (useTrendsQuery) as one compact CSS bar track per funnel
// series — no chart dep; each bar's title carries "day: value". Loading / error /
// all-zero-empty states go through the same DataShell defaults the tiles use.
import { useParams } from "wouter";
import {
  type MetricsResponse,
  useMetricsQuery,
  useTrendsQuery,
} from "../../features/screens/api";
import { PageHeader, Section } from "../../ui/layout";
import { Card, DataShell } from "../../ui/primitives";

const STATS: Array<{
  key: keyof MetricsResponse["metrics"];
  label: string;
  note: string;
}> = [
  { key: "new_leads", label: "New leads", note: "Last 30 days" },
  {
    key: "conversations_started",
    label: "Conversations started",
    note: "Last 30 days",
  },
  {
    key: "conversations_completed",
    label: "Conversations completed",
    note: "Last 30 days",
  },
  { key: "qualified", label: "Qualified", note: "Last 30 days" },
  { key: "bookings", label: "Bookings", note: "Last 30 days" },
  { key: "open_tasks", label: "Open tasks", note: "All time" },
];

// The three daily series to chart — a subset of the tiles, each a numeric column of a trend row.
const TREND_SERIES: Array<{
  key: "new_leads" | "conversations_started" | "bookings";
  label: string;
}> = [
  { key: "new_leads", label: "New leads" },
  { key: "conversations_started", label: "Conversations started" },
  { key: "bookings", label: "Bookings" },
];

export function DashboardPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useMetricsQuery(orgId);
  const trends = useTrendsQuery(orgId);
  const trendRows = trends.data?.trends ?? [];
  // Honest empty: the API returned no days, or every day of the window is all-zero.
  const trendsEmpty =
    trendRows.length === 0 ||
    trendRows.every(
      (r) =>
        r.new_leads === 0 && r.conversations_started === 0 && r.bookings === 0,
    );
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Analytics" />
      <DataShell isLoading={isLoading} isError={isError || !data}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STATS.map((stat) => (
            <Card key={stat.key} padding="lg" className="flex flex-col gap-1.5">
              <p className="text-label text-muted uppercase">{stat.label}</p>
              <p className="text-h1 text-ink tabular-nums">
                {data?.metrics[stat.key].toLocaleString()}
              </p>
              <p className="text-xs text-muted">{stat.note}</p>
            </Card>
          ))}
        </div>
      </DataShell>
      <Section label="Trends" className="mt-10">
        <DataShell
          isLoading={trends.isLoading}
          isError={trends.isError || !trends.data}
          isEmpty={trendsEmpty}
          emptyText="No activity in the last 30 days yet."
        >
          <Card padding="lg" className="flex flex-col gap-6">
            {TREND_SERIES.map(({ key, label }) => {
              const peak = Math.max(1, ...trendRows.map((r) => r[key]));
              return (
                <div key={key} className="flex flex-col gap-1.5">
                  <p className="text-label text-muted uppercase">{label}</p>
                  <div className="flex h-16 items-end gap-px">
                    {trendRows.map((r) => (
                      <div
                        key={r.day}
                        className="flex-1 bg-accent"
                        style={{ height: `${(r[key] / peak) * 100}%` }}
                        title={`${r.day}: ${r[key]}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted">Last 30 days</p>
          </Card>
        </DataShell>
      </Section>
    </div>
  );
}
