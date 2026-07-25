// task-33 (wave 5 C) · C-RED — legacy src/screens/ layer retirement, coordinated test rewrite.
// This file SUPERSEDES the task-23 promotion spec (pins move in the SAME PR as the code, the
// sanctioned rewrite). The shared conversation deep-link leaf <ConversationLink> RELOCATES out of
// the retired src/screens/ layer to apps/console/src/features/conversations/ConversationLink.tsx
// and re-skins blue→gold (text-blue-600 → text-accent). Same props / behaviour / href shape. The
// four call-site PAGES (Home / Tasks / Contacts / Conversations) import the new path and inline no
// deep-link literal; the whole src/screens/ directory (index.tsx, ContactsTable.tsx,
// ConversationLink.tsx, README.md) is DELETED — nothing routes to it (routes.tsx wires pages/ only).
//
// Env-free by construction: AC-1 renders an isolated presentational leaf under a static SSR Router
// (renderToStaticMarkup, no QueryClient / DB / supabase) — the ContactsTable / TranscriptView
// precedent. AC-2 / AC-3 are Bun.file source reads + node:fs existence checks (no module load).
import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "../apps/console/test/router";

// The relocated surface AC-1 DEFINES: a pure, prop-driven leaf
// `ConversationLink({ orgId, conversationId, children })` now at
// apps/console/src/features/conversations/ConversationLink.tsx. conversationId is string | null —
// null renders children as plain text (no anchor). Isolated from the query hooks so it renders
// under renderToStaticMarkup with no providers, exactly like TranscriptView.
type ConversationLinkFn = (props: {
  orgId: string;
  conversationId: string | null;
  children: ReactNode;
}) => ReactElement;

// NEW home (task-33). RED today: the leaf still lives at src/screens/ConversationLink and has not
// been relocated → the import below throws, loadConversationLink returns undefined, and the typeof
// assertion is the RED (a clean assertion failure — the try/catch converts the missing module into
// `undefined`, the established pattern for these leaf specs, not a raw import crash).
const SURFACE = "../apps/console/src/features/conversations/ConversationLink";

async function loadConversationLink(): Promise<ConversationLinkFn | undefined> {
  try {
    const mod = await import(SURFACE);
    return (mod as { ConversationLink?: ConversationLinkFn }).ConversationLink;
  } catch {
    return undefined; // not relocated yet → the typeof assertion below is the RED
  }
}

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
// The exact anchor the relocated + re-skinned leaf renders: href before class (wouter drops the
// onClick under renderToStaticMarkup), the gold token `text-accent hover:underline` (was
// text-blue-600), children as the anchor text.
const EXACT_ANCHOR = `<a href="/o/${ORG}/conversations/${CONV}" class="text-accent hover:underline">Ada Lovelace</a>`;

describe("AC-1: ConversationLink relocates to features/conversations and re-skins to text-accent", () => {
  it("non-null conversationId renders a wouter <Link> anchor to /o/<orgId>/conversations/<id> with the text-accent className and children as anchor text", async () => {
    const ConversationLink = await loadConversationLink();
    expect(typeof ConversationLink).toBe("function"); // RED today: leaf not relocated
    const Comp = ConversationLink as ConversationLinkFn;
    const html = renderToStaticMarkup(
      <StaticRouter>
        <Comp orgId={ORG} conversationId={CONV}>
          Ada Lovelace
        </Comp>
      </StaticRouter>,
    );
    expect(html).toContain(`href="/o/${ORG}/conversations/${CONV}"`);
    expect(html).toContain("text-accent hover:underline"); // blue→gold re-skin
    expect(html).not.toContain("text-blue-600"); // the retired blue token is gone
    expect(html).toContain(EXACT_ANCHOR);
  });

  it("null conversationId renders children as plain text with NO anchor (behaviour preserved)", async () => {
    const ConversationLink = await loadConversationLink();
    expect(typeof ConversationLink).toBe("function"); // RED today: leaf not relocated
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

// AC-2: the four call-site PAGES adopt the relocated leaf — each imports it from the new
// features/conversations path, none still imports the retired src/screens/ path, each renders
// <ConversationLink>, and none inlines the /o/<org>/conversations/ deep-link literal (the href
// shape lives ONLY inside the leaf). Source-level + env-free (Bun.file text reads). RED today: the
// pages still `import { ConversationLink } from "../../screens/ConversationLink"`.
const CALL_SITES = [
  "apps/console/src/pages/Home/index.tsx",
  "apps/console/src/pages/Tasks/index.tsx",
  "apps/console/src/pages/Contacts/index.tsx",
  "apps/console/src/pages/Conversations/index.tsx",
] as const;
// A ConversationLink import from features/conversations (new) vs the retired src/screens (old).
const IMPORTS_NEW =
  /from\s+["'][^"']*features\/conversations\/ConversationLink["']/;
const IMPORTS_OLD = /from\s+["'][^"']*screens\/ConversationLink["']/;
const USES_LINK = /<ConversationLink\b/;
const INLINE_DEEPLINK = /\/o\/\$\{[^}]*\}\/conversations\//;

describe("AC-2: call-site pages import the relocated ConversationLink (retired path gone, no inline literal)", () => {
  for (const path of CALL_SITES) {
    it(`${path} imports ConversationLink from features/conversations, not from src/screens, and uses it`, async () => {
      const src = await Bun.file(path).text();
      expect(src).toMatch(IMPORTS_NEW); // RED today: imports ../../screens/ConversationLink instead
      expect(src).not.toMatch(IMPORTS_OLD); // RED today: the retired src/screens path is still imported
      expect(src).toMatch(USES_LINK);
    });

    it(`${path} inlines no /o/<org>/conversations/ deep-link literal (href shape lives only in the leaf)`, async () => {
      const src = await Bun.file(path).text();
      expect(src).not.toMatch(INLINE_DEEPLINK); // regression: pages already delegate the href to the leaf
    });
  }
});

// AC-3: the src/screens/ presentational layer is RETIRED — the whole directory and its files are
// gone (the readme-coverage guard is readdirSync-derived, so it then stops requiring a
// screens/README). The layering docs that pointed at it are updated in the same PR: src/README no
// longer describes the "legacy V1 screens" layer, ui/README no longer carries its "Restyling the
// legacy screens" section. Env-free: node:fs existence + Bun.file reads, CWD = worktree root.
const SCREENS_DIR = "apps/console/src/screens";
// ContactsTable.tsx's deletion is pinned by console-contact-links.test.tsx (its subject); this
// block owns the directory + the other three files, so the two suites partition the four cleanly.
const RETIRED_FILES = [
  "apps/console/src/screens/ConversationLink.tsx",
  "apps/console/src/screens/index.tsx",
  "apps/console/src/screens/README.md",
] as const;

describe("AC-3: the legacy src/screens/ layer is retired (directory + files deleted, docs updated)", () => {
  it("the apps/console/src/screens directory no longer exists", () => {
    expect(existsSync(SCREENS_DIR)).toBe(false); // RED today: the directory is still present
  });

  for (const f of RETIRED_FILES) {
    it(`${f} is deleted`, () => {
      expect(existsSync(f)).toBe(false); // RED today: still present
    });
  }

  it("src/README no longer describes the legacy screens/ source layer", async () => {
    const src = await Bun.file("apps/console/src/README.md").text();
    expect(src).not.toContain("legacy V1 screens"); // RED today: the screens/ layer bullet
  });

  it("ui/README no longer carries the 'Restyling the legacy screens' section", async () => {
    const src = await Bun.file("apps/console/src/ui/README.md").text();
    expect(src).not.toContain("Restyling the legacy screens"); // RED today: the obsolete section header
  });
});
