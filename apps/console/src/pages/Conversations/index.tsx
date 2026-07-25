// Conversations / live monitor — the /o/:orgId/live route surface, composed from ui/
// primitives (see ui/README.md); the legacy screens/index.tsx LiveMonitor it replaced is
// now retired (task-33). Server state via the existing useConversationsQuery hook (R2),
// org context from the URL (R7), all text rendered as inert nodes (S7.1). Transcript
// deep-links go through the shared ConversationLink leaf (features/conversations).
import { useParams } from "wouter";
import { ConversationLink } from "../../features/conversations/ConversationLink";
import { useConversationsQuery } from "../../features/screens/api";
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

// Statuses that mean the conversation is live right now — the one gold accent per row.
const ACTIVE_STATUSES = new Set(["queued", "ringing", "active"]);

export function ConversationsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useConversationsQuery(orgId);
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Conversations" />
      <DataShell
        isLoading={isLoading}
        isError={isError || !data}
        isEmpty={data?.conversations.length === 0}
        emptyText="No conversations."
      >
        <Card padding="lg">
          <Table>
            <THead>
              <TH>Contact</TH>
              <TH>Channel</TH>
              <TH>Status</TH>
              <TH>Started</TH>
            </THead>
            <tbody>
              {data?.conversations.map((c) => (
                <Row key={c.id}>
                  <TD tone="ink" className="font-medium">
                    <ConversationLink orgId={orgId} conversationId={c.id}>
                      {c.contact_name ?? "Unknown"}
                    </ConversationLink>
                  </TD>
                  <TD>{c.channel}</TD>
                  <TD>
                    <Badge
                      tone={
                        ACTIVE_STATUSES.has(c.status) ? "accent" : "neutral"
                      }
                    >
                      {c.status}
                    </Badge>
                  </TD>
                  <TD>{c.started_at ?? "—"}</TD>
                </Row>
              ))}
            </tbody>
          </Table>
        </Card>
      </DataShell>
    </div>
  );
}
