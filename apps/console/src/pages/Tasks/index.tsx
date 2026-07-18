// /o/:orgId/tasks — rebuilt with ui/ primitives (page-fleet restyle; this file used to
// re-export screens/index.tsx TaskQueue). Server state via useTasksQuery
// (features/screens/api.ts, R2); org context from the URL (R7). Title cells deep-link
// through the shared, test-pinned ConversationLink (plain text when conversation_id is
// null) — never inline the /o/<org>/conversations/<id> literal. All text renders as
// inert text nodes only (S7.1).
import { useParams } from "wouter";
import { useTasksQuery } from "../../features/screens/api";
import { ConversationLink } from "../../screens/ConversationLink";
import { PageHeader } from "../../ui/layout";
import { Badge, Card } from "../../ui/primitives";

const TH = "py-2.5 pr-4 text-label text-muted uppercase font-medium";
const TD = "py-3 pr-4 text-sm text-ink-soft";
const TD_TITLE = "py-3 pr-4 text-sm font-medium text-ink";

export function TasksPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useTasksQuery(orgId);
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Tasks" />
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm text-muted">Unable to load data.</p>
      ) : data.tasks.length === 0 ? (
        <p className="text-sm text-muted">No tasks.</p>
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
                  <td className={TD_TITLE}>
                    <ConversationLink
                      orgId={orgId}
                      conversationId={task.conversation_id}
                    >
                      {task.title}
                    </ConversationLink>
                  </td>
                  <td className={TD}>{task.kind}</td>
                  <td className={TD}>
                    <Badge tone={task.status === "open" ? "accent" : "neutral"}>
                      {task.status}
                    </Badge>
                  </td>
                  <td className={TD}>{task.priority ?? "—"}</td>
                  <td className={TD}>{task.due_at ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
