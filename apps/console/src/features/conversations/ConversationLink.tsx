// The shared conversation deep-link leaf, relocated here (task-33, wave 5 C) from the retired
// src/screens/ layer and colocated with the conversations domain it serves (beside TranscriptView /
// api.ts). Promoted in task-23 (react-component.md:21 "second usage → promote"; #17 / #50 reviews)
// from an idiom once triplicated across the old screens; now the ONE leaf the Home / Tasks /
// Contacts / Conversations pages deep-link through. Prop-driven and env-free: no query hooks, no
// lib/supabase, so it renders under renderToStaticMarkup inside a static SSR Router, exactly like
// TranscriptView. A non-null conversationId deep-links its children via wouter <Link> (SPA soft-nav)
// to the conversation transcript, in gold (text-accent — re-skinned from the retired blue); null
// renders children as plain text with no anchor. Children render as inert text nodes only — no raw
// HTML (S7.1).
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
      className="text-accent hover:underline"
    >
      {children}
    </Link>
  ) : (
    children
  );
}
