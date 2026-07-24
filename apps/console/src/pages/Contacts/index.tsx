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

type ContactRow = ContactsResponse["contacts"][number];

function contactName(contact: ContactRow): string {
  return (
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "—"
  );
}

export function ContactsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useContactsQuery(orgId);
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Contacts" />
      <DataShell
        isLoading={isLoading}
        isError={isError || !data}
        isEmpty={data?.contacts.length === 0}
        emptyText="No contacts."
      >
        <Card padding="lg">
          <Table>
            <THead>
              <TH>Name</TH>
              <TH>Lifecycle stage</TH>
              <TH>Score</TH>
              <TH>Last interaction</TH>
            </THead>
            <tbody>
              {data?.contacts.map((contact) => (
                <Row key={contact.id}>
                  <TD className="font-medium text-ink">
                    <ConversationLink
                      orgId={orgId}
                      conversationId={contact.latest_conversation_id}
                    >
                      {contactName(contact)}
                    </ConversationLink>
                  </TD>
                  <TD>
                    <Badge tone="neutral">{contact.lifecycle_stage}</Badge>
                  </TD>
                  <TD>{contact.score ?? "—"}</TD>
                  <TD>{contact.last_interaction_at ?? "—"}</TD>
                </Row>
              ))}
            </tbody>
          </Table>
        </Card>
      </DataShell>
    </div>
  );
}
