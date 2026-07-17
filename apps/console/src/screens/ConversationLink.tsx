// Task 23 (react-component.md:21 "second usage → promote"; flagged by the #17 and #50 reviews):
// the conversation deep-link idiom — previously triplicated across TaskQueue, LiveMonitor and
// ContactsTable — promoted to one presentational leaf. Prop-driven and env-free: no query hooks,
// no lib/supabase, so it renders under renderToStaticMarkup inside a static SSR Router, exactly
// like ContactsTable / TranscriptView. A non-null conversationId deep-links its children via
// wouter <Link> (SPA soft-nav) to the conversation transcript; null renders children as plain
// text with no anchor. Children render as inert text nodes only — no raw HTML (S7.1).
import type { ReactNode } from "react";
import { Link } from "wouter";

export function ConversationLink({
  orgId,
  conversationId,
  children,
}: {
  orgId: string;
  conversationId: string | null;
  children: ReactNode;
}) {
  return conversationId ? (
    <Link
      href={`/o/${orgId}/conversations/${conversationId}`}
      className="text-blue-600 hover:underline"
    >
      {children}
    </Link>
  ) : (
    children
  );
}
