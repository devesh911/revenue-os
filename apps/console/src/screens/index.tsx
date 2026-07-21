// The four V1 screens (D4/architecture E) — server state via TanStack Query hooks
// (features/screens/api.ts, R2); org context from the URL (R7). Text renders as plain
// text nodes only — no raw-HTML injection anywhere (S7.1).
//
// NOTE (design-system foundation): this file's PATH and SOURCE are pinned by
// tests/conversation-link.test.tsx (ConversationLink import + usage, no inline
// deep-link), so these components stay here; src/pages/* re-export them as route
// surfaces. Skin below is LIGHT (tokens + Card/Badge/PageHeader) — the full per-page
// restyle is the page-fleet's job, done by rebuilding pages/* with ui/ primitives.
import type { ReactNode } from "react";
import { useParams } from "wouter";
import {
  useContactsQuery,
  useConversationsQuery,
  useMetricsQuery,
  useTasksQuery,
} from "../features/screens/api";
import { PageHeader } from "../ui/layout";
import { Badge, Card } from "../ui/primitives";
import { ContactsTable } from "./ContactsTable";
import { ConversationLink } from "./ConversationLink";

function ScreenShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-5xl">
      <PageHeader title={title} />
      {children}
    </section>
  );
}

function LoadingRow() {
  return <p className="text-sm text-muted">Loading…</p>;
}

function ErrorRow() {
  return <p className="text-sm text-muted">Unable to load data.</p>;
}

function EmptyRow({ label }: { label: string }) {
  return <p className="text-sm text-muted">{label}</p>;
}

const TH = "py-2.5 pr-4 text-label text-muted uppercase font-medium";
const TD = "py-3 pr-4 text-sm text-ink-soft";

export function TaskQueue() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useTasksQuery(orgId);
  return (
    <ScreenShell title="Task queue">
      {isLoading ? (
        <LoadingRow />
      ) : isError || !data ? (
        <ErrorRow />
      ) : data.tasks.length === 0 ? (
        <EmptyRow label="No tasks." />
      ) : (
        <Card padding="lg">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>Title</th>
                <th className={TH}>Kind</th>
                <th className={TH}>Status</th>
                <th className={TH}>Priority</th>
                <th className={TH}>Due</th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((task) => (
                <tr
                  key={task.id}
                  className="border-b border-line last:border-0"
                >
                  <td className={`${TD} font-medium text-ink`}>
                    <ConversationLink
                      orgId={orgId}
                      conversationId={task.conversation_id}
                    >
                      {task.title}
                    </ConversationLink>
                  </td>
                  <td className={TD}>{task.kind}</td>
                  <td className={TD}>{task.status}</td>
                  <td className={TD}>{task.priority ?? "—"}</td>
                  <td className={TD}>{task.due_at ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </ScreenShell>
  );
}

const ACTIVE_STATUSES = new Set(["queued", "ringing", "active"]);

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={ACTIVE_STATUSES.has(status) ? "accent" : "neutral"}>
      {status}
    </Badge>
  );
}

export function LiveMonitor() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useConversationsQuery(orgId);
  return (
    <ScreenShell title="Conversations">
      {isLoading ? (
        <LoadingRow />
      ) : isError || !data ? (
        <ErrorRow />
      ) : data.conversations.length === 0 ? (
        <EmptyRow label="No conversations." />
      ) : (
        <Card padding="lg">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>Contact</th>
                <th className={TH}>Channel</th>
                <th className={TH}>Status</th>
                <th className={TH}>Started</th>
              </tr>
            </thead>
            <tbody>
              {data.conversations.map((convo) => (
                <tr
                  key={convo.id}
                  className="border-b border-line last:border-0"
                >
                  <td className={`${TD} font-medium text-ink`}>
                    <ConversationLink orgId={orgId} conversationId={convo.id}>
                      {convo.contact_name ?? "Unknown"}
                    </ConversationLink>
                  </td>
                  <td className={TD}>{convo.channel}</td>
                  <td className={TD}>
                    <StatusBadge status={convo.status} />
                  </td>
                  <td className={TD}>{convo.started_at ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </ScreenShell>
  );
}

export function ContactTimeline() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useContactsQuery(orgId);
  return (
    <ScreenShell title="Contacts">
      {isLoading ? (
        <LoadingRow />
      ) : isError || !data ? (
        <ErrorRow />
      ) : data.contacts.length === 0 ? (
        <EmptyRow label="No contacts." />
      ) : (
        <Card padding="lg">
          <ContactsTable orgId={orgId} contacts={data.contacts} />
        </Card>
      )}
    </ScreenShell>
  );
}

function StatTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: number;
  caption?: string;
}) {
  return (
    <Card>
      <p className="text-label text-muted uppercase">{label}</p>
      <p className="mt-2 text-[28px] font-bold tracking-tight text-ink">
        {value}
      </p>
      {caption ? <p className="mt-1 text-xs text-muted">{caption}</p> : null}
    </Card>
  );
}

export function Dashboard() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useMetricsQuery(orgId);
  const CAPTION = "(last 30 days)";
  return (
    <ScreenShell title="Dashboard">
      {isLoading ? (
        <LoadingRow />
      ) : isError || !data ? (
        <ErrorRow />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatTile
            label="New leads"
            value={data.metrics.new_leads}
            caption={CAPTION}
          />
          <StatTile
            label="Conversations started"
            value={data.metrics.conversations_started}
            caption={CAPTION}
          />
          <StatTile
            label="Completed"
            value={data.metrics.conversations_completed}
            caption={CAPTION}
          />
          <StatTile
            label="Qualified"
            value={data.metrics.qualified}
            caption={CAPTION}
          />
          <StatTile
            label="Bookings"
            value={data.metrics.bookings}
            caption={CAPTION}
          />
          <StatTile label="Open tasks" value={data.metrics.open_tasks} />
        </div>
      )}
    </ScreenShell>
  );
}
