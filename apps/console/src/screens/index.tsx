// The four V1 screens (D4/architecture E) — server state via TanStack Query hooks
// (features/screens/api.ts, R2); org context from the URL (R7). Text renders as plain
// text nodes only — no raw-HTML injection anywhere (S7.1).
import type { ReactNode } from "react";
import { Link, useParams } from "wouter";
import {
  useContactsQuery,
  useConversationsQuery,
  useMetricsQuery,
  useTasksQuery,
} from "../features/screens/api";

function ScreenShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function LoadingRow() {
  return <p className="text-sm text-gray-500">Loading…</p>;
}

function ErrorRow() {
  return <p className="text-sm text-gray-500">Unable to load data.</p>;
}

function EmptyRow({ label }: { label: string }) {
  return <p className="text-sm text-gray-500">{label}</p>;
}

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
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-500">
              <th className="py-2 pr-4">Title</th>
              <th className="py-2 pr-4">Kind</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Priority</th>
              <th className="py-2 pr-4">Due</th>
            </tr>
          </thead>
          <tbody>
            {data.tasks.map((task) => (
              <tr key={task.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  {task.conversation_id ? (
                    <Link
                      href={`/o/${orgId}/conversations/${task.conversation_id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {task.title}
                    </Link>
                  ) : (
                    task.title
                  )}
                </td>
                <td className="py-2 pr-4">{task.kind}</td>
                <td className="py-2 pr-4">{task.status}</td>
                <td className="py-2 pr-4">{task.priority ?? "—"}</td>
                <td className="py-2 pr-4">{task.due_at ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ScreenShell>
  );
}

const ACTIVE_STATUSES = new Set(["queued", "ringing", "active"]);

function StatusBadge({ status }: { status: string }) {
  const active = ACTIVE_STATUSES.has(status);
  return (
    <span
      className={
        active
          ? "rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
          : "rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
      }
    >
      {status}
    </span>
  );
}

export function LiveMonitor() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useConversationsQuery(orgId);
  return (
    <ScreenShell title="Live monitor">
      {isLoading ? (
        <LoadingRow />
      ) : isError || !data ? (
        <ErrorRow />
      ) : data.conversations.length === 0 ? (
        <EmptyRow label="No conversations." />
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-500">
              <th className="py-2 pr-4">Contact</th>
              <th className="py-2 pr-4">Channel</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Started</th>
            </tr>
          </thead>
          <tbody>
            {data.conversations.map((convo) => (
              <tr key={convo.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <Link
                    href={`/o/${orgId}/conversations/${convo.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {convo.contact_name ?? "Unknown"}
                  </Link>
                </td>
                <td className="py-2 pr-4">{convo.channel}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={convo.status} />
                </td>
                <td className="py-2 pr-4">{convo.started_at ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-500">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Lifecycle stage</th>
              <th className="py-2 pr-4">Score</th>
              <th className="py-2 pr-4">Last interaction</th>
            </tr>
          </thead>
          <tbody>
            {data.contacts.map((contact) => (
              <tr key={contact.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  {[contact.first_name, contact.last_name]
                    .filter(Boolean)
                    .join(" ") || "—"}
                </td>
                <td className="py-2 pr-4">{contact.lifecycle_stage}</td>
                <td className="py-2 pr-4">{contact.score ?? "—"}</td>
                <td className="py-2 pr-4">
                  {contact.last_interaction_at ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    <div className="rounded border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {caption ? <p className="mt-1 text-xs text-gray-400">{caption}</p> : null}
    </div>
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
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
