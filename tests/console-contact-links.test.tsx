// Task 17 (transcript links — docs/sdlc.md §3 P3 polish): Contacts rows deep-link to the
// contact's latest conversation transcript. RED / test-is-spec. Env-free: renders over an
// isolated presentational leaf (the TranscriptView precedent), so it needs no Router,
// QueryClient, DB, or supabase module load — it runs in CI's plain `bun test`.
import { describe, expect, it } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Mirrors ContactsResponse["contacts"][number] AFTER AC1 lands: the console Zod schema in
// apps/console/src/features/screens/api.ts gains `latest_conversation_id: uuid | null`.
type ContactFixture = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  lifecycle_stage: string;
  score: number | null;
  last_interaction_at: string | null;
  created_at: string;
  latest_conversation_id: string | null;
};

// The surface this test DEFINES (brief's design-freedom note): a pure, prop-driven leaf
// `ContactsTable({ orgId, contacts })` at apps/console/src/screens/ContactsTable.tsx that
// ContactTimeline renders in its success branch. Kept isolated from the query hooks so it
// renders under renderToStaticMarkup with no providers — exactly like TranscriptView.
type ContactsTableFn = (props: {
  orgId: string;
  contacts: ContactFixture[];
}) => ReactElement;

const SURFACE = "../apps/console/src/screens/ContactsTable";

async function loadContactsTable(): Promise<ContactsTableFn | undefined> {
  try {
    const mod = await import(SURFACE);
    return (mod as { ContactsTable?: ContactsTableFn }).ContactsTable;
  } catch {
    return undefined; // leaf not built yet → the typeof assertion below is the RED
  }
}

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const base = {
  lifecycle_stage: "lead",
  score: null,
  last_interaction_at: null,
  created_at: "2026-07-01T00:00:00Z",
} as const;
const linked: ContactFixture = {
  ...base,
  id: "33333333-3333-4333-8333-333333333333",
  first_name: "Ada",
  last_name: "Lovelace",
  latest_conversation_id: CONV,
};
const unlinked: ContactFixture = {
  ...base,
  id: "44444444-4444-4444-8444-444444444444",
  first_name: "Grace",
  last_name: "Hopper",
  latest_conversation_id: null,
};
const linkRe = new RegExp(
  `<a[^>]*href="/o/${ORG}/conversations/${CONV}"[^>]*>\\s*Ada Lovelace\\s*</a>`,
);

describe("AC1: console ContactsResponse Zod schema gains latest_conversation_id", () => {
  it("declares latest_conversation_id as a contacts-schema field (uuid | null)", async () => {
    const src = await Bun.file(
      "apps/console/src/features/screens/api.ts",
    ).text();
    // RED today: the field is absent from the ContactsResponse contact object.
    expect(src).toMatch(/latest_conversation_id\s*:/);
  });
});

describe("AC2: ContactTimeline deep-links a contact to its latest conversation transcript", () => {
  it("a contact WITH a latest_conversation_id renders an anchor to /o/<orgId>/conversations/<id>, name as the anchor text", async () => {
    const ContactsTable = await loadContactsTable();
    expect(typeof ContactsTable).toBe("function"); // RED today: leaf unbuilt
    const Comp = ContactsTable as ContactsTableFn;
    const html = renderToStaticMarkup(<Comp orgId={ORG} contacts={[linked]} />);
    expect(html).toContain(`href="/o/${ORG}/conversations/${CONV}"`);
    expect(html).toMatch(linkRe);
  });

  it("a contact with latest_conversation_id = null renders exactly as today: plain text, no anchor", async () => {
    const ContactsTable = await loadContactsTable();
    expect(typeof ContactsTable).toBe("function");
    const Comp = ContactsTable as ContactsTableFn;
    const html = renderToStaticMarkup(
      <Comp orgId={ORG} contacts={[unlinked]} />,
    );
    expect(html).toContain("Grace Hopper");
    expect(html).not.toMatch(/<a[\s>]/);
  });

  it("with both contacts, only the linked one is an anchor; the null contact stays plain text", async () => {
    const ContactsTable = await loadContactsTable();
    expect(typeof ContactsTable).toBe("function");
    const Comp = ContactsTable as ContactsTableFn;
    const html = renderToStaticMarkup(
      <Comp orgId={ORG} contacts={[linked, unlinked]} />,
    );
    expect(html.match(/<a[\s>]/g)?.length ?? 0).toBe(1);
    expect(html).toMatch(linkRe);
    expect(html).not.toMatch(/<a[^>]*>[^<]*Grace Hopper/);
    expect(html).toContain("Grace Hopper");
  });
});
