// Analytics (route surface /o/:orgId/dashboard, sidebar label "Analytics") — rebuilt
// on the design system: PageHeader + a responsive grid of stat Cards fed by
// useMetricsQuery (features/screens/api.ts — R2, Zod-parsed). Counts are 30-day
// windows except open_tasks, which is all-time. The Trends section is an honest
// empty state: time-series data arrives with the analytics API; nothing is faked.
// Loading / error handled where the data lands (ui/README skeleton).
import { useParams } from "wouter";
import {
  type MetricsResponse,
  useMetricsQuery,
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

export function DashboardPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useMetricsQuery(orgId);
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
        <Card padding="lg" className="text-center">
          <p className="text-sm text-muted">
            Time-series trends arrive with the analytics API.
          </p>
        </Card>
      </Section>
    </div>
  );
}
