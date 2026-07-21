// Contacts — page-fleet rebuild of the /o/:orgId/contacts route surface with ui/
// primitives (ui/README "Restyling the legacy screens": restyle by rebuilding THIS
// wrapper; the path+source test-pinned screens/ContactsTable.tsx stays untouched and
// simply drops out of the route). Data via the existing useContactsQuery hook (R2);
// loading / error / empty handled where the data lands. Names deep-link to the
// contact's latest conversation through the shared <ConversationLink> (Task 23 idiom —
// null renders plain text, no anchor); all cells render inert text nodes only (S7.1).
import { useParams } from "wouter";
import {
  type ContactsResponse,
  useContactsQuery,
} from "../../features/screens/api";
import { ConversationLink } from "../../screens/ConversationLink";
import { PageHeader } from "../../ui/layout";
import { Badge, Card } from "../../ui/primitives";

type ContactRow = ContactsResponse["contacts"][number];

function contactName(contact: ContactRow): string {
  return (
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "—"
  );
}

const TH = "py-2.5 pr-4 text-label text-muted uppercase";
const TD = "py-3 pr-4 text-sm text-ink-soft";

export function ContactsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useContactsQuery(orgId);
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Contacts" />
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm text-muted">Unable to load data.</p>
      ) : data.contacts.length === 0 ? (
        <p className="text-sm text-muted">No contacts.</p>
      ) : (
        <Card padding="lg">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>Name</th>
                <th className={TH}>Lifecycle stage</th>
                <th className={TH}>Score</th>
                <th className={TH}>Last interaction</th>
              </tr>
            </thead>
            <tbody>
              {data.contacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-b border-line last:border-0"
                >
                  <td className={`${TD} font-medium text-ink`}>
                    <ConversationLink
                      orgId={orgId}
                      conversationId={contact.latest_conversation_id}
                    >
                      {contactName(contact)}
                    </ConversationLink>
                  </td>
                  <td className={TD}>
                    <Badge tone="neutral">{contact.lifecycle_stage}</Badge>
                  </td>
                  <td className={TD}>{contact.score ?? "—"}</td>
                  <td className={TD}>{contact.last_interaction_at ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
