// /o/:orgId/tasks — rebuilt with ui/ primitives (page-fleet restyle; this file used to
// re-export screens/index.tsx TaskQueue). Server state via useTasksQuery
// (features/screens/api.ts, R2); org context from the URL (R7). Loading / error / empty
// go through <DataShell>; tabular data through the <Table> suite (ui/README skeleton) —
// no hand-rolled ternary or <table>, no local TH/TD class consts. Title cells deep-link
// through the shared, test-pinned ConversationLink (plain text when conversation_id is
// null) — never inline the /o/<org>/conversations/<id> literal. All text renders as
// inert text nodes only (S7.1).
import { useParams } from "wouter";
import { useTasksQuery } from "../../features/screens/api";
import { ConversationLink } from "../../screens/ConversationLink";
import { PageHeader } from "../../ui/layout";
import {
  Badge,
  Card,
  DataShell,
  Row,
  Table,
  TD,
  TH,
  THead,
} from "../../ui/primitives";

export function TasksPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useTasksQuery(orgId);
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Tasks" />
      <DataShell
        isLoading={isLoading}
        isError={isError || !data}
        isEmpty={data?.tasks.length === 0}
        emptyText="No tasks."
      >
        <Card padding="lg">
          <Table>
            <THead>
              <TH>Title</TH>
              <TH>Kind</TH>
              <TH>Status</TH>
              <TH>Priority</TH>
              <TH>Due</TH>
            </THead>
            <tbody>
              {data?.tasks.map((task) => (
                <Row key={task.id}>
                  <TD className="font-medium text-ink">
                    <ConversationLink
                      orgId={orgId}
                      conversationId={task.conversation_id}
                    >
                      {task.title}
                    </ConversationLink>
                  </TD>
                  <TD>{task.kind}</TD>
                  <TD>
                    <Badge tone={task.status === "open" ? "accent" : "neutral"}>
                      {task.status}
                    </Badge>
                  </TD>
                  <TD>{task.priority ?? "—"}</TD>
                  <TD>{task.due_at ?? "—"}</TD>
                </Row>
              ))}
            </tbody>
          </Table>
        </Card>
      </DataShell>
    </div>
  );
}
