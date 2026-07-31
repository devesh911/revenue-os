// task-53 (Feed-2 M1 — memory-write): the `end-of-call-report` branch of the Vapi processor
// must ALSO fold the call summary into contact_memories, in the SAME transaction that completes
// the conversation. Invariants pinned here: one row per report, exactly ONE live summary per
// contact (the previous one gets superseded_by = the new row), silent skips when there is no
// contact or no summary, org-scoped rows that the neighbouring tenant cannot read.
// Harness = vapi-webhook.test.ts's: the receiver stores the event, processVapiEvents drains it;
// the admin (postgres) pool writes fixtures and reads RLS-exempt for assertions.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { withOrg } from "@revenue-os/db";
import pg from "pg";
import { pool } from "../src/db";
import app from "../src/index";
import { processVapiEvents } from "../src/vapi/process";

const SECRET = process.env.VAPI_WEBHOOK_SECRET || "local-test-secret";
const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});

const RUN = Date.now(); // webhook_events.dedupe_key is globally unique — keep call ids per-run
const SLUGS = ["mem-write-a", "mem-write-b"];
const SUMMARY_1 =
  "Wants a 3BHK in Whitefield; budget 1.2cr; call back Saturday.";
const SUMMARY_2 = "Visited the site; comparing floor plans; decides next week.";

let orgA = "";
let orgB = "";
let clock = 0; // distinct payload timestamps: the processor orders a batch by them

async function cleanup() {
  const scope = `(select id from orgs where slug = any($1))`;
  // contact_memories first: superseded_by is a self-FK without cascade, so drop the chain
  // ourselves rather than lean on delete-order inside the org cascade.
  await admin.query(`delete from contact_memories where org_id in ${scope}`, [
    SLUGS,
  ]);
  await admin.query(`delete from webhook_events where org_id in ${scope}`, [
    SLUGS,
  ]);
  await admin.query(`delete from usage_events where org_id in ${scope}`, [
    SLUGS,
  ]);
  await admin.query(`delete from audit_log where org_id in ${scope}`, [SLUGS]);
  await admin.query(`delete from orgs where slug = any($1)`, [SLUGS]);
}

beforeAll(async () => {
  await cleanup();
  const orgs = await admin.query(
    `insert into orgs (name, slug) values ('Memory Org A', 'mem-write-a'), ('Memory Org B', 'mem-write-b')
     returning id, slug`,
  );
  orgA = orgs.rows.find((r) => r.slug === "mem-write-a").id;
  orgB = orgs.rows.find((r) => r.slug === "mem-write-b").id;
});

afterAll(async () => {
  await cleanup();
  await admin.end();
});

async function newContact(orgId: string, firstName: string): Promise<string> {
  const r = await admin.query(
    `insert into contacts (org_id, first_name) values ($1, $2) returning id`,
    [orgId, firstName],
  );
  return r.rows[0].id;
}

/** A conversation exactly as place_call writes it: contact attached, provider_ref = Vapi call id
 *  (the processor's ensureConversation upserts onto this row). contactId null = unknown caller. */
async function newCall(
  orgId: string,
  contactId: string | null,
  callId: string,
): Promise<string> {
  const r = await admin.query(
    `insert into conversations (org_id, contact_id, channel, direction, status, provider, provider_ref)
     values ($1, $2, 'voice', 'outbound', 'active', 'vapi', $3) returning id`,
    [orgId, contactId, callId],
  );
  return r.rows[0].id;
}

function post(orgId: string, body: unknown) {
  return app.fetch(
    new Request(`http://localhost/webhooks/vapi/${orgId}`, {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        "x-vapi-secret": SECRET,
      }),
      body: JSON.stringify(body),
    }),
  );
}

/** An end-of-call report. `summary: null` OMITS the key (a report that carries no summary at all —
 *  a literal null would fail the shared Zod schema and never reach the branch under test). */
function report(callId: string, summary: string | null, tag = "eocr") {
  const message: Record<string, unknown> = {
    type: "end-of-call-report",
    call: { id: callId },
    timestamp: `2026-07-20T10:${String(clock++).padStart(2, "0")}:00Z`,
    id: `${callId}-${tag}`,
    endedReason: "hangup",
  };
  if (summary !== null) message.summary = summary;
  return { message };
}

async function memories(contactId: string) {
  const r = await admin.query(
    `select id, org_id, kind, content, embedding, source_conversation_id, superseded_by
       from contact_memories where contact_id = $1`,
    [contactId],
  );
  return r.rows;
}

async function eventStatuses(dedupeKeys: string[]) {
  const r = await admin.query(
    `select status, count(*)::int n from webhook_events where dedupe_key = any($1) group by status`,
    [dedupeKeys],
  );
  return r.rows;
}

describe("end-of-call-report folds a summary into contact memory (M1)", () => {
  it("writes exactly one live summary row carrying the source conversation", async () => {
    const callId = `mem-happy-${RUN}`;
    const contact = await newContact(orgA, "Alice");
    const convo = await newCall(orgA, contact, callId);

    expect((await post(orgA, report(callId, SUMMARY_1))).status).toBe(202);
    await processVapiEvents(pool, orgA);

    const c = (
      await admin.query(
        `select status, ended_at, summary from conversations where id = $1`,
        [convo],
      )
    ).rows[0];
    expect(c.status).toBe("completed"); // the existing branch keeps its behaviour
    expect(c.summary).toBe(SUMMARY_1);
    expect(c.ended_at).not.toBeNull();

    const rows = await memories(contact);
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe("summary");
    expect(rows[0].content).toBe(SUMMARY_1); // verbatim — M1 stores, it does not rewrite
    expect(rows[0].source_conversation_id).toBe(convo);
    expect(rows[0].org_id).toBe(orgA);
    expect(rows[0].embedding).toBeNull(); // embeddings are a later milestone
    expect(rows[0].superseded_by).toBeNull(); // this is the live row

    expect(await eventStatuses([`vapi:${callId}-eocr`])).toEqual([
      { status: "processed", n: 1 },
    ]);
  });

  it("a later call supersedes the previous summary — exactly one live row per contact", async () => {
    const contact = await newContact(orgA, "Bianca");
    const call1 = `mem-lin1-${RUN}`;
    const call2 = `mem-lin2-${RUN}`;

    const convo1 = await newCall(orgA, contact, call1);
    await post(orgA, report(call1, SUMMARY_1));
    await processVapiEvents(pool, orgA);

    const convo2 = await newCall(orgA, contact, call2);
    await post(orgA, report(call2, SUMMARY_2));
    await processVapiEvents(pool, orgA);

    const rows = await memories(contact);
    expect(rows.length).toBe(2); // append-only: the old row survives, never overwritten
    const live = rows.filter((r) => r.superseded_by === null);
    expect(live.length).toBe(1); // the load-bearing invariant
    expect(live[0].content).toBe(SUMMARY_2); // newest call wins
    expect(live[0].source_conversation_id).toBe(convo2);

    const superseded = rows.find((r) => r.id !== live[0].id);
    expect(superseded.superseded_by).toBe(live[0].id); // lineage points at the new row
    expect(superseded.content).toBe(SUMMARY_1); // history preserved verbatim
    expect(superseded.source_conversation_id).toBe(convo1);
  });
});

// Each skip case rides in a batch with a contact-bearing CONTROL call: without the control a
// "wrote nothing" assert is vacuously true today and would pin nothing after GREEN.
describe("silent skips (no memory, no error, conversation still updated)", () => {
  it("skips a conversation with no contact — unknown caller, same batch still folds the control", async () => {
    const anon = `mem-anon-${RUN}`; // no fixture row: the processor creates it, contact_id null
    const control = `mem-ctl1-${RUN}`;
    const contact = await newContact(orgA, "Carla");
    await newCall(orgA, contact, control);

    await post(orgA, report(anon, "Unknown caller asked for directions."));
    await post(orgA, report(control, SUMMARY_1));
    await processVapiEvents(pool, orgA);

    const anonConvo = (
      await admin.query(
        `select id, contact_id, status, summary from conversations
          where org_id = $1 and provider = 'vapi' and provider_ref = $2`,
        [orgA, anon],
      )
    ).rows[0];
    expect(anonConvo.contact_id).toBeNull();
    expect(anonConvo.status).toBe("completed"); // the conversation update still happens
    expect(anonConvo.summary).toContain("directions");

    const orphans = await admin.query(
      `select count(*)::int n from contact_memories where source_conversation_id = $1`,
      [anonConvo.id],
    );
    expect(orphans.rows[0].n).toBe(0); // no contact → nowhere to hang a memory
    expect((await memories(contact)).length).toBe(1); // control: the batch kept folding

    expect(
      await eventStatuses([`vapi:${anon}-eocr`, `vapi:${control}-eocr`]),
    ).toEqual([{ status: "processed", n: 2 }]); // skipping memory ≠ a failed event
  });

  it("skips a report that carries no summary at all", async () => {
    const silentContact = await newContact(orgA, "Dara");
    const controlContact = await newContact(orgA, "Elena");
    const silent = `mem-nosum-${RUN}`;
    const control = `mem-ctl2-${RUN}`;
    const silentConvo = await newCall(orgA, silentContact, silent);
    await newCall(orgA, controlContact, control);

    await post(orgA, report(silent, null)); // summary key omitted entirely
    await post(orgA, report(control, SUMMARY_2));
    await processVapiEvents(pool, orgA);

    expect((await memories(silentContact)).length).toBe(0);
    const c = (
      await admin.query(
        `select status, summary from conversations where id = $1`,
        [silentConvo],
      )
    ).rows[0];
    expect(c.status).toBe("completed");
    expect(c.summary).toBeNull();
    expect((await memories(controlContact)).length).toBe(1); // control
  });

  it("skips an empty-string summary — nothing to remember is not a memory", async () => {
    const emptyContact = await newContact(orgA, "Farid");
    const controlContact = await newContact(orgA, "Gita");
    const empty = `mem-empty-${RUN}`;
    const control = `mem-ctl3-${RUN}`;
    await newCall(orgA, emptyContact, empty);
    await newCall(orgA, controlContact, control);

    await post(orgA, report(empty, ""));
    await post(orgA, report(control, SUMMARY_1));
    await processVapiEvents(pool, orgA);

    expect((await memories(emptyContact)).length).toBe(0);
    expect((await memories(controlContact)).length).toBe(1); // control
  });
});

describe("re-delivery and the other message branches", () => {
  it("an exact replay + a second processor pass never double-write memory (S6.3)", async () => {
    const contact = await newContact(orgA, "Hari");
    const callId = `mem-dup-${RUN}`;
    await newCall(orgA, contact, callId);
    const body = report(callId, SUMMARY_1);

    expect((await post(orgA, body)).status).toBe(202);
    expect((await post(orgA, body)).status).toBe(202); // same dedupe_key → no second row
    const stored = await admin.query(
      `select count(*)::int n from webhook_events where dedupe_key = $1`,
      [`vapi:${callId}-eocr`],
    );
    expect(stored.rows[0].n).toBe(1);

    await processVapiEvents(pool, orgA);
    await processVapiEvents(pool, orgA); // drained events are 'processed', never re-folded

    const rows = await memories(contact);
    expect(rows.length).toBe(1); // one report, one memory
    expect(rows[0].superseded_by).toBeNull(); // a re-fold would supersede its own row
  });

  it("only the report writes memory — transcript and status-update stay untouched", async () => {
    const contact = await newContact(orgA, "Ira");
    const callId = `mem-mixed-${RUN}`;
    const convo = await newCall(orgA, contact, callId);

    await post(orgA, {
      message: {
        type: "transcript",
        call: { id: callId },
        timestamp: "2026-07-20T11:00:01Z",
        role: "user",
        transcript: "Call me Saturday.",
        id: `${callId}-t1`,
      },
    });
    await post(orgA, {
      message: {
        type: "status-update",
        call: { id: callId },
        timestamp: "2026-07-20T11:00:02Z",
        id: `${callId}-su`,
        status: "in-progress",
      },
    });
    await post(orgA, report(callId, SUMMARY_2));
    await processVapiEvents(pool, orgA);

    const msgs = await admin.query(
      `select content from messages where conversation_id = $1 order by seq`,
      [convo],
    );
    expect(msgs.rows.map((m) => m.content)).toEqual(["Call me Saturday."]);

    const rows = await memories(contact);
    expect(rows.length).toBe(1); // three events, ONE memory — only the report folds
    expect(rows[0].source_conversation_id).toBe(convo);

    expect(
      await eventStatuses([
        `vapi:${callId}-t1`,
        `vapi:${callId}-su`,
        `vapi:${callId}-eocr`,
      ]),
    ).toEqual([{ status: "processed", n: 3 }]);
  });
});

describe("tenancy [cross-tenant denial] — contact_memories", () => {
  it("stamps the processing org and hides the row from the neighbouring tenant", async () => {
    const contactA = await newContact(orgA, "Jaya");
    const callA = `mem-tenA-${RUN}`;
    await newCall(orgA, contactA, callA);
    await post(orgA, report(callA, SUMMARY_1));
    await processVapiEvents(pool, orgA);

    const contactB = await newContact(orgB, "Kabir");
    const callB = `mem-tenB-${RUN}`;
    await newCall(orgB, contactB, callB);
    await post(orgB, report(callB, SUMMARY_2));
    await processVapiEvents(pool, orgB);

    const a = await memories(contactA);
    const b = await memories(contactB);
    expect(a.length).toBe(1);
    expect(a[0].org_id).toBe(orgA);
    expect(b.length).toBe(1);
    expect(b[0].org_id).toBe(orgB); // B's own call folded into B, never into A

    // the SAME query through packages/db (app_service + request.org_id): visible to the owner…
    const owner = await withOrg(pool, orgA, (tx) =>
      tx.query<{ id: string }>(
        `select id from contact_memories where contact_id = $1`,
        [contactA],
      ),
    );
    expect(owner.rows.length).toBe(1); // non-vacuous: the row IS readable in its own org
    // …invisible to the neighbour, who asks for it by id
    const neighbour = await withOrg(pool, orgB, (tx) =>
      tx.query<{ id: string }>(
        `select id from contact_memories where contact_id = $1`,
        [contactA],
      ),
    );
    expect(neighbour.rows.length).toBe(0); // RLS denial — the whole moat

    // and an UNSCOPED read from B returns B's rows only
    const unscoped = await withOrg(pool, orgB, (tx) =>
      tx.query<{ org_id: string }>(`select org_id from contact_memories`),
    );
    expect(unscoped.rows.length).toBeGreaterThan(0);
    expect(unscoped.rows.filter((r) => r.org_id !== orgB).length).toBe(0);
  });
});
