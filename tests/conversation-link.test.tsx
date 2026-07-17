// Task 23 (react-component.md:21 "second usage → promote"; flagged by the #17 and #50 reviews):
// the conversation deep-link idiom — triplicated across TaskQueue, LiveMonitor and ContactsTable —
// becomes ONE shared <ConversationLink>. RED / test-is-spec. Env-free: renders an isolated
// presentational leaf under a static SSR Router (the ContactsTable / TranscriptView precedent) — no
// QueryClient, DB, or supabase module load. AC-3 (behaviour preserved) is guarded by the existing
// console-contact-links.test.tsx, which stays green because the promoted anchor is byte-identical.
import { describe, expect, it } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "../apps/console/test/router";

// The surface AC-1 DEFINES: a pure, prop-driven leaf `ConversationLink({ orgId, conversationId,
// children })` at apps/console/src/screens/ConversationLink.tsx. conversationId is string | null —
// TaskQueue and ContactsTable pass a nullable id; LiveMonitor always passes a string, so the shared
// component's null branch simply never triggers there. Isolated from the query hooks so it renders
// under renderToStaticMarkup with no providers, exactly like ContactsTable / TranscriptView.
type ConversationLinkFn = (props: {
  orgId: string;
  conversationId: string | null;
  children: ReactNode;
}) => ReactElement;

const SURFACE = "../apps/console/src/screens/ConversationLink";

async function loadConversationLink(): Promise<ConversationLinkFn | undefined> {
  try {
    const mod = await import(SURFACE);
    return (mod as { ConversationLink?: ConversationLinkFn }).ConversationLink;
  } catch {
    return undefined; // component not promoted yet → the typeof assertion below is the RED
  }
}

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
// The exact anchor the idiom renders today (probed from ContactsTable's live output): href before
// class — wouter drops the onClick handler under renderToStaticMarkup — children as the anchor text.
const EXACT_ANCHOR = `<a href="/o/${ORG}/conversations/${CONV}" class="text-blue-600 hover:underline">Ada Lovelace</a>`;

describe("AC-1: ConversationLink promotes the shared conversation deep-link idiom", () => {
  it("non-null conversationId renders a wouter <Link> anchor to /o/<orgId>/conversations/<id> with the deep-link className and children as anchor text", async () => {
    const ConversationLink = await loadConversationLink();
    expect(typeof ConversationLink).toBe("function"); // RED today: component unbuilt
    const Comp = ConversationLink as ConversationLinkFn;
    const html = renderToStaticMarkup(
      <StaticRouter>
        <Comp orgId={ORG} conversationId={CONV}>
          Ada Lovelace
        </Comp>
      </StaticRouter>,
    );
    expect(html).toContain(`href="/o/${ORG}/conversations/${CONV}"`);
    expect(html).toContain(EXACT_ANCHOR);
  });

  it("null conversationId renders children as plain text with NO anchor", async () => {
    const ConversationLink = await loadConversationLink();
    expect(typeof ConversationLink).toBe("function"); // RED today: component unbuilt
    const Comp = ConversationLink as ConversationLinkFn;
    const html = renderToStaticMarkup(
      <StaticRouter>
        <Comp orgId={ORG} conversationId={null}>
          Grace Hopper
        </Comp>
      </StaticRouter>,
    );
    expect(html).toContain("Grace Hopper");
    expect(html).not.toMatch(/<a[\s>]/);
  });
});

// AC-2 (DRY): the idiom is PROMOTED, not copied — all three screens import & use ConversationLink,
// and NONE still inline the `/o/${...}/conversations/${...}` deep-link literal. Source-level and
// env-free; the TaskQueue / LiveMonitor full-screen render tests are env-dependent (CI-owned), so
// AC-1's unit + these source assertions cover their deep-link behaviour off-stack.
const INDEX = "apps/console/src/screens/index.tsx";
const CONTACTS = "apps/console/src/screens/ContactsTable.tsx";
const IMPORTS_LINK = /from\s+["']\.\/ConversationLink["']/;
const USES_LINK = /<ConversationLink\b/;
const USES_LINK_G = /<ConversationLink\b/g;
const INLINE_DEEPLINK = /\/o\/\$\{[^}]*\}\/conversations\//;

describe("AC-2: all three screens use the shared ConversationLink (no copied idiom)", () => {
  it("index.tsx (TaskQueue + LiveMonitor) imports ConversationLink and uses it in both screens", async () => {
    const src = await Bun.file(INDEX).text();
    expect(src).toMatch(IMPORTS_LINK); // RED today: not imported
    const uses = src.match(USES_LINK_G)?.length ?? 0;
    expect(uses).toBeGreaterThanOrEqual(2); // RED today: 0 — both TaskQueue and LiveMonitor must adopt it
  });

  it("ContactsTable.tsx imports and uses ConversationLink", async () => {
    const src = await Bun.file(CONTACTS).text();
    expect(src).toMatch(IMPORTS_LINK); // RED today: not imported
    expect(src).toMatch(USES_LINK); // RED today: still inlines the idiom
  });

  it("index.tsx no longer inlines the /o/<org>/conversations/ deep-link literal", async () => {
    const src = await Bun.file(INDEX).text();
    expect(src).not.toMatch(INLINE_DEEPLINK); // RED today: TaskQueue + LiveMonitor both inline it
  });

  it("ContactsTable.tsx no longer inlines the /o/<org>/conversations/ deep-link literal", async () => {
    const src = await Bun.file(CONTACTS).text();
    expect(src).not.toMatch(INLINE_DEEPLINK); // RED today: still inlines it
  });
});
