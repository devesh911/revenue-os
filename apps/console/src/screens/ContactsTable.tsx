// Task 17 (transcript links — docs/sdlc.md §3 P3 polish): the Contacts screen's presentational
// leaf. Prop-driven and env-free to import — no query hooks, no lib/api, no lib/supabase (the
// ContactsResponse import is type-only, erased at runtime). A contact WITH a latest_conversation_id
// deep-links its name via wouter <Link> (SPA soft-nav, matching TaskQueue/LiveMonitor) to that
// conversation's transcript; null renders as plain text. Names render as inert text nodes only — no
// raw HTML (S7.1). <Link> reads a Router from context: the app supplies one at runtime; the unit
// test renders this leaf inside a static SSR Router (apps/console/test/router.tsx).
import { Link } from "wouter";
import type { ContactsResponse } from "../features/screens/api";

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
  return (
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
        {contacts.map((contact) => (
          <tr key={contact.id} className="border-b last:border-0">
            <td className="py-2 pr-4">
              {contact.latest_conversation_id ? (
                <Link
                  href={`/o/${orgId}/conversations/${contact.latest_conversation_id}`}
                  className="text-blue-600 hover:underline"
                >
                  {contactName(contact)}
                </Link>
              ) : (
                contactName(contact)
              )}
            </td>
            <td className="py-2 pr-4">{contact.lifecycle_stage}</td>
            <td className="py-2 pr-4">{contact.score ?? "—"}</td>
            <td className="py-2 pr-4">{contact.last_interaction_at ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
