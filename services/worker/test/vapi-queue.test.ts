// STATE.md NEXT-3 (P2): webhook_events → processVapiEvents rides pg-boss, not test glue.
// Spec of this suite: events posted to the receiver must land in conversations/messages
// through the QUEUE ALONE — processVapiEvents is never called here. Same S6 semantics as
// vapi-webhook.test.ts (out-of-order arrival, dedupe-by-constraint, store-and-skip).
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import app from "../src/index";
import { startJobs, stopJobs } from "../src/jobs";

const SECRET = process.env.VAPI_WEBHOOK_SECRET || "local-test-secret";
const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 1,
});

let orgId = "";
const callId = `qcall-${Date.now()}`;

async function cleanup() {
  await admin.query(
    `delete from webhook_events where org_id in (select id from orgs where slug = 'vapi-queue-test')`,
  );
  await admin.query(
    `delete from usage_events where org_id in (select id from orgs where slug = 'vapi-queue-test')`,
  );
  await admin.query(
    `delete from audit_log where org_id in (select id from orgs where slug = 'vapi-queue-test')`,
  );
  await admin.query(`delete from orgs where slug = 'vapi-queue-test'`);
}

beforeAll(async () => {
  await cleanup();
  const org = await admin.query(
    `insert into orgs (name, slug) values ('Vapi Queue Org', 'vapi-queue-test') returning id`,
  );
  orgId = org.rows[0].id;
  await startJobs(); // real pg-boss on the real local DB — mocks lie (tech-stack testing L2)
}, 30_000); // cold start installs pg-boss's own schema objects

afterAll(async () => {
  await stopJobs();
  await cleanup();
  await admin.end();
});

function post(body: unknown) {
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

/** Poll until no 'received' vapi events remain for the org (the consumer drained them). */
async function waitForDrain(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = await admin.query(
      `select count(*)::int n from webhook_events where org_id = $1 and status = 'received'`,
      [orgId],
    );
    if (r.rows[0].n === 0) return;
    if (Date.now() > deadline)
      throw new Error(
        `queue never drained: ${r.rows[0].n} events still 'received'`,
      );
    await new Promise((res) => setTimeout(res, 200));
  }
}

describe("vapi pipeline via pg-boss (P2 wiring)", () => {
  it("drains receiver-inserted events into conversation + seq-ordered messages — no direct processor call", async () => {
    // out of order on purpose: t3 arrives before t2 (the CLAUDE.md Vapi gotcha)
    expect(
      (
        await post(
          transcriptEvent(
            3,
            "assistant",
            "Great, booking your visit.",
            "2026-07-11T10:00:20Z",
          ),
        )
      ).status,
    ).toBe(202);
    expect(
      (
        await post(
          transcriptEvent(
            2,
            "user",
            "Yes, this is Alice.",
            "2026-07-11T10:00:10Z",
          ),
        )
      ).status,
    ).toBe(202);
    expect(
      (
        await post(
          transcriptEvent(
            1,
            "assistant",
            "Hello! Am I speaking with Alice?",
            "2026-07-11T10:00:01Z",
          ),
        )
      ).status,
    ).toBe(202);
    expect(
      (
        await post({
          message: {
            type: "end-of-call-report",
            call: { id: callId },
            timestamp: "2026-07-11T10:01:00Z",
            id: `${callId}-eocr`,
            summary: "Qualified caller; site visit interest.",
            endedReason: "hangup",
          },
        })
      ).status,
    ).toBe(202);

    await waitForDrain();

    const convo = await admin.query(
      `select id, status, summary from conversations where org_id = $1 and provider = 'vapi' and provider_ref = $2`,
      [orgId, callId],
    );
    expect(convo.rows.length).toBe(1);
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

    const statuses = await admin.query(
      `select status, count(*)::int n from webhook_events where org_id = $1 group by status`,
      [orgId],
    );
    expect(statuses.rows).toEqual([{ status: "processed", n: 4 }]);
  }, 30_000); // a real queue drain under full-suite load outlives bun's 5s default

  it("an exact replay dedupes at the constraint and drains to a no-op (S6.3)", async () => {
    const before = await admin.query(
      `select count(*)::int n from messages where org_id = $1`,
      [orgId],
    );
    expect(
      (
        await post(
          transcriptEvent(
            2,
            "user",
            "Yes, this is Alice.",
            "2026-07-11T10:00:10Z",
          ),
        )
      ).status,
    ).toBe(202);
    await waitForDrain();
    const after = await admin.query(
      `select count(*)::int n from messages where org_id = $1`,
      [orgId],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n); // dedupe_key conflict → nothing new
  }, 30_000);

  it("unknown event types end 'skipped' via the queue — stored, never guessed (S6.5)", async () => {
    expect(
      (
        await post({
          message: {
            type: "some-future-thing",
            call: { id: callId },
            id: `${callId}-mystery`,
          },
        })
      ).status,
    ).toBe(202);
    await waitForDrain();
    const r = await admin.query(
      `select status from webhook_events where dedupe_key = $1`,
      [`vapi:${callId}-mystery`],
    );
    expect(r.rows[0].status).toBe("skipped");
  }, 30_000);
});
