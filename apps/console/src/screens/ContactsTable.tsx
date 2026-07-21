// Task 17 (transcript links — docs/sdlc.md §3 P3 polish): the Contacts screen's presentational
// leaf. Prop-driven and env-free to import — no query hooks, no lib/api, no lib/supabase (the
// ContactsResponse import is type-only, erased at runtime). A contact WITH a latest_conversation_id
// deep-links its name to that conversation's transcript via the shared <ConversationLink> (Task 23 —
// the promoted deep-link idiom, SPA soft-nav matching TaskQueue/LiveMonitor); null renders as plain
// text. Names render as inert text nodes only — no raw HTML (S7.1). ConversationLink's wouter <Link>
// reads a Router from context: the app supplies one at runtime; the unit test renders this leaf
// inside a static SSR Router (apps/console/test/router.tsx).
import type { ContactsResponse } from "../features/screens/api";
import { ConversationLink } from "./ConversationLink";

type ContactRow = ContactsResponse["contacts"][number];

function contactName(contact: ContactRow): string {
  return (
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "—"
  );
}

export function ContactsTable({
  orgId,
  contacts,
}: {
  orgId: string;
  contacts: ContactRow[];
}) {
  const th = "py-2.5 pr-4 text-label text-muted uppercase font-medium";
  const td = "py-3 pr-4 text-sm text-ink-soft";
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-line">
          <th className={th}>Name</th>
          <th className={th}>Lifecycle stage</th>
          <th className={th}>Score</th>
          <th className={th}>Last interaction</th>
        </tr>
      </thead>
      <tbody>
        {contacts.map((contact) => (
          <tr key={contact.id} className="border-b border-line last:border-0">
            <td className={`${td} font-medium text-ink`}>
              <ConversationLink
                orgId={orgId}
                conversationId={contact.latest_conversation_id}
              >
                {contactName(contact)}
              </ConversationLink>
            </td>
            <td className={td}>{contact.lifecycle_stage}</td>
            <td className={td}>{contact.score ?? "—"}</td>
            <td className={td}>{contact.last_interaction_at ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
