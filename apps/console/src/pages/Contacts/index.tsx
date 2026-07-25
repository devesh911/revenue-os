// Contacts — the /o/:orgId/contacts route surface, composed from ui/ primitives (the
// legacy src/screens/ContactsTable leaf it replaced is now retired — task-33). Data via
// the existing useContactsQuery hook (R2); loading / error / empty handled where the data
// lands. Names deep-link to the contact's latest conversation through the shared
// <ConversationLink> (features/conversations — null renders plain text, no anchor); all
// cells render inert text nodes only (S7.1).
import { useParams } from "wouter";
import { ConversationLink } from "../../features/conversations/ConversationLink";
import {
  type ContactsResponse,
  useContactsQuery,
} from "../../features/screens/api";
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
                  <TD tone="ink" className="font-medium">
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
