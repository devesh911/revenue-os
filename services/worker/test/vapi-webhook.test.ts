// Task 8 (local slice): webhook receiver (S6 — verify RAW body secret, insert-with-dedupe,
// 202-fast) + async processor (upsert conversation by provider_ref, order messages by seq
// even when events arrive OUT OF ORDER — the Vapi gotcha in CLAUDE.md).
// Fixtures are synthetic; recording REAL payloads replaces them during the Vapi spike
// (needs VAPI_API_KEY — Devesh). That is this task's remaining acceptance item.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { pool } from "../src/db";
import app from "../src/index";
import { processVapiEvents } from "../src/vapi/process";

const SECRET = process.env.VAPI_WEBHOOK_SECRET || "local-test-secret";
const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 1,
});

let orgId = "";
const callId = `call-${Date.now()}`;

async function cleanup() {
  await admin.query(
    `delete from webhook_events where org_id in (select id from orgs where slug = 'vapi-test')`,
  );
  await admin.query(
    `delete from usage_events where org_id in (select id from orgs where slug = 'vapi-test')`,
  );
  await admin.query(
    `delete from audit_log where org_id in (select id from orgs where slug = 'vapi-test')`,
  );
  await admin.query(`delete from orgs where slug = 'vapi-test'`);
}

beforeAll(async () => {
  await cleanup();
  const org = await admin.query(
    `insert into orgs (name, slug) values ('Vapi Org', 'vapi-test') returning id`,
  );
  orgId = org.rows[0].id;
});

afterAll(async () => {
  await cleanup();
  await admin.end();
});

function post(body: unknown, secret: string | null) {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret) headers.set("x-vapi-secret", secret);
  return app.fetch(
    new Request(`http://localhost/webhooks/vapi/${orgId}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function transcriptEvent(
  seqHint: number,
  role: "assistant" | "user",
  text: string,
  at: string,
) {
  return {
    message: {
      type: "transcript",
      call: { id: callId },
      timestamp: at,
      role,
      transcript: text,
      id: `${callId}-t${seqHint}`,
    },
  };
}

describe("vapi webhook receiver (S6)", () => {
  it("rejects a missing or wrong secret and stores nothing", async () => {
    expect((await post({ message: { type: "transcript" } }, null)).status).toBe(
      401,
    );
    expect(
      (await post({ message: { type: "transcript" } }, "wrong")).status,
    ).toBe(401);
    const r = await admin.query(
      `select count(*)::int n from webhook_events where org_id = $1`,
      [orgId],
    );
    expect(r.rows[0].n).toBe(0);
  });

  it("malformed JSON with a valid secret is a clean 400, never a 5xx (S5.8)", async () => {
    // repro from the 2026-07-11 local E2E spike: JSON.parse threw before safeParse,
    // landing in onError as a logged internal -> 500 (invites provider retry storms)
    const res = await app.fetch(
      new Request(`http://localhost/webhooks/vapi/${orgId}`, {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
          "x-vapi-secret": SECRET,
        }),
        body: "not json{{",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_payload" });
  });

  it("accepts a signed event fast (202) and dedupes exact replays (S6.3)", async () => {
    const ev = transcriptEvent(
      1,
      "assistant",
      "Hello! Am I speaking with Alice?",
      "2026-07-10T10:00:01Z",
    );
    expect((await post(ev, SECRET)).status).toBe(202);
    expect((await post(ev, SECRET)).status).toBe(202); // replay → no-op by constraint
    const r = await admin.query(
      `select count(*)::int n from webhook_events where org_id = $1 and status = 'received'`,
      [orgId],
    );
    expect(r.rows[0].n).toBe(1);
  });

  it("processes events into conversation + seq-ordered messages despite out-of-order arrival", async () => {
    // arrive out of order: t3 lands before t2
    await post(
      transcriptEvent(
        3,
        "assistant",
        "Great, booking your visit.",
        "2026-07-10T10:00:20Z",
      ),
      SECRET,
    );
    await post(
      transcriptEvent(2, "user", "Yes, this is Alice.", "2026-07-10T10:00:10Z"),
      SECRET,
    );
    await post(
      {
        message: {
          type: "end-of-call-report",
          call: { id: callId },
          timestamp: "2026-07-10T10:01:00Z",
          id: `${callId}-eocr`,
          summary: "Qualified caller; site visit interest.",
          endedReason: "hangup",
        },
      },
      SECRET,
    );

    await processVapiEvents(pool, orgId);

    const convo = await admin.query(
      `select id, status, summary from conversations where org_id = $1 and provider = 'vapi' and provider_ref = $2`,
      [orgId, callId],
    );
    expect(convo.rows.length).toBe(1); // upsert by provider_ref — three events, one conversation
    expect(convo.rows[0].status).toBe("completed");
    expect(convo.rows[0].summary).toContain("Qualified");

    const msgs = await admin.query(
      `select seq, role, content from messages where conversation_id = $1 order by seq`,
      [convo.rows[0].id],
    );
    expect(msgs.rows.map((m) => m.content)).toEqual([
      "Hello! Am I speaking with Alice?",
      "Yes, this is Alice.",
      "Great, booking your visit.",
    ]); // timestamp order, not arrival order

    const done = await admin.query(
      `select count(*)::int n from webhook_events where org_id = $1 and status = 'processed'`,
      [orgId],
    );
    expect(done.rows[0].n).toBe(4);
  });

  it("stores-and-skips unknown event types — never guesses (S6.5)", async () => {
    await post(
      {
        message: {
          type: "some-future-thing",
          call: { id: callId },
          id: `${callId}-mystery`,
        },
      },
      SECRET,
    );
    await processVapiEvents(pool, orgId);
    const r = await admin.query(
      `select status from webhook_events where dedupe_key = $1`,
      [`vapi:${callId}-mystery`],
    );
    expect(r.rows[0].status).toBe("skipped");
  });
});
