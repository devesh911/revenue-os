// task-33 (wave 5 C) · C-RED — screens/ retirement: ContactsTable leaf repointed to pages/Contacts.
// This SUPERSEDES the task-17 spec that rendered the src/screens/ContactsTable leaf directly: that
// leaf is DELETED with the rest of the legacy src/screens/ layer, and the Contacts PAGE
// (pages/Contacts, the routed surface) now owns the contact→transcript deep-link inline via the
// relocated shared <ConversationLink> (apps/console/src/features/conversations/ConversationLink —
// its render, incl. the anchor and null-plain-text branches, is unit-pinned by
// tests/conversation-link.test.tsx, and the page-level happy render by
// apps/console/test/pages-adoption-behavior.test.tsx). Here we KEEP the ContactsResponse schema pin
// and REPOINT the deep-link expectations to pages/Contacts at the SOURCE level, plus pin the
// ContactsTable leaf's deletion. Env-free: Bun.file text reads + node:fs existence (no module load
// — a full ContactsPage render lives in apps/console/test/ where wouter resolves, not the repo-root
// tests/ suite; see apps/console/test/router.tsx).
import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";

const CONTACTS_PAGE = "apps/console/src/pages/Contacts/index.tsx";
// A ConversationLink import from the relocated features/conversations path vs the retired screens.
const IMPORTS_NEW =
  /from\s+["'][^"']*features\/conversations\/ConversationLink["']/;
const IMPORTS_OLD = /from\s+["'][^"']*screens\/ConversationLink["']/;
const INLINE_DEEPLINK = /\/o\/\$\{[^}]*\}\/conversations\//;

describe("AC1 (KEEP): console ContactsResponse Zod schema declares latest_conversation_id", () => {
  it("declares latest_conversation_id as a contacts-schema field (uuid | null)", async () => {
    const src = await Bun.file(
      "apps/console/src/features/screens/api.ts",
    ).text();
    // Regression pin: the contact→transcript deep-link depends on this field surviving the refactor.
    expect(src).toMatch(/latest_conversation_id\s*:/);
  });
});

describe("AC2 (repoint): pages/Contacts owns the contact→transcript deep-link via the relocated leaf", () => {
  it("imports ConversationLink from features/conversations, not from the retired src/screens path", async () => {
    const src = await Bun.file(CONTACTS_PAGE).text();
    expect(src).toMatch(IMPORTS_NEW); // RED today: imports ../../screens/ConversationLink instead
    expect(src).not.toMatch(IMPORTS_OLD); // RED today: the retired src/screens path is still imported
  });

  it("deep-links each contact by passing latest_conversation_id to ConversationLink (no inline href)", async () => {
    const src = await Bun.file(CONTACTS_PAGE).text();
    // The anchor-vs-plain-text wiring lives in the leaf; the page must feed it the id and never
    // hand-roll the /o/<org>/conversations/ literal itself.
    expect(src).toMatch(/<ConversationLink\b/);
    expect(src).toMatch(/conversationId=\{[^}]*latest_conversation_id[^}]*\}/); // regression
    expect(src).not.toMatch(INLINE_DEEPLINK); // regression: the href shape stays inside the leaf
  });
});

describe("AC3 (retire): the src/screens/ContactsTable leaf is deleted", () => {
  it("apps/console/src/screens/ContactsTable.tsx no longer exists", () => {
    expect(existsSync("apps/console/src/screens/ContactsTable.tsx")).toBe(
      false,
    ); // RED today: present
  });
});
