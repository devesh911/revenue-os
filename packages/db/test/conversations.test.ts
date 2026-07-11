// Transcript read path (transcript-UI task): cross-tenant denial + seq ordering.
// Same harness shape as rls.test.ts — fixtures as postgres (RLS-exempt), reads as app_service.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Pool } from "pg";
import { conversationMessages, createPool } from "../src";

const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const APP_SERVICE_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";

const admin = new Pool({ connectionString: LOCAL_DB_URL, max: 2 });
let appService: Pool;
let orgA = "";
let orgB = "";
let convoA = "";

beforeAll(async () => {
  const orgs = await admin.query(
    `insert into orgs (name, slug) values
       ('Convo Test Org A', 'convo-test-a'), ('Convo Test Org B', 'convo-test-b')
     returning id, slug`,
  );
  orgA = orgs.rows.find((r) => r.slug === "convo-test-a").id;
  orgB = orgs.rows.find((r) => r.slug === "convo-test-b").id;
  const convo = await admin.query(
    `insert into conversations (org_id, channel, direction) values ($1, 'voice', 'inbound')
     returning id`,
    [orgA],
  );
  convoA = convo.rows[0].id;
  // deliberately inserted OUT of order — the read path must sort by seq
  await admin.query(
    `insert into messages (org_id, conversation_id, seq, role, content) values
       ($1, $2, 3, 'agent',   'third'),
       ($1, $2, 1, 'contact', 'first'),
       ($1, $2, 2, 'agent',   null)`,
    [orgA, convoA],
  );
  appService = createPool(APP_SERVICE_URL);
});

afterAll(async () => {
  await admin.query(
    `delete from orgs where slug in ('convo-test-a','convo-test-b')`,
  );
  await appService?.end();
  await admin.end();
});

describe("conversationMessages tenant isolation + ordering", () => {
  it("returns the transcript ordered by seq for the owning org", async () => {
    const rows = await conversationMessages(appService, orgA, convoA);
    expect(rows).not.toBeNull();
    expect(rows?.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(rows?.[0]?.content).toBe("first");
    expect(rows?.[1]?.content).toBeNull(); // nullable content survives the boundary
  });

  it("cross-org read is denied: org B asking for org A's conversation gets null", async () => {
    const rows = await conversationMessages(appService, orgB, convoA);
    expect(rows).toBeNull(); // conversation invisible under RLS -> null (route maps to 404)
  });

  it("an unknown conversation id in the right org is null, not an empty transcript", async () => {
    const rows = await conversationMessages(
      appService,
      orgA,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(rows).toBeNull();
  });

  it("rejects a non-uuid conversation id at the boundary (Zod)", async () => {
    expect(
      conversationMessages(appService, orgA, "not-a-uuid"),
    ).rejects.toThrow();
  });
});
