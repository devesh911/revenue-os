// Conversations / live monitor — page-fleet rebuild of the /o/:orgId/live route surface
// with ui/ primitives (see ui/README.md). Previously a bare re-export of screens/index.tsx
// LiveMonitor; that screen stays untouched (path+source pinned by tests/conversation-link
// .test.tsx) — this page owns the styled surface now. Server state via the existing
// useConversationsQuery hook (R2), org context from the URL (R7), all text rendered as
// inert nodes (S7.1). Transcript deep-links go through the shared ConversationLink leaf.
import { useParams } from "wouter";
import { useConversationsQuery } from "../../features/screens/api";
import { ConversationLink } from "../../screens/ConversationLink";
import { PageHeader } from "../../ui/layout";
import { Badge, Card } from "../../ui/primitives";

// Statuses that mean the conversation is live right now — the one gold accent per row.
const ACTIVE_STATUSES = new Set(["queued", "ringing", "active"]);

const TH = "py-2.5 pr-4 text-label text-muted uppercase font-medium";
const TD = "py-3 pr-4 text-sm text-ink-soft";

export function ConversationsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useConversationsQuery(orgId);
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Conversations" />
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm text-muted">Unable to load data.</p>
      ) : data.conversations.length === 0 ? (
        <p className="text-sm text-muted">No conversations.</p>
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
              {data.conversations.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className={`${TD} font-medium text-ink`}>
                    <ConversationLink orgId={orgId} conversationId={c.id}>
                      {c.contact_name ?? "Unknown"}
                    </ConversationLink>
                  </td>
                  <td className={TD}>{c.channel}</td>
                  <td className={TD}>
                    <Badge
                      tone={
                        ACTIVE_STATUSES.has(c.status) ? "accent" : "neutral"
                      }
                    >
                      {c.status}
                    </Badge>
                  </td>
                  <td className={TD}>{c.started_at ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
