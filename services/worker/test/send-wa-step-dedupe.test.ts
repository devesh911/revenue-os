// biome-ignore-all lint/suspicious/noThenProperty: `then` is a workflow step FIELD (data, not a
// thenable) in the T26.2 definition JSON — same suppression as scheduler.test.ts.
// H8 (hole audit, Package 2 / task-58) — RED spec: send_wa's exactly-once key must identify THIS
// SEND, not this template. REAL-DB INTEGRATION, CI-OWNED (ci.yml supabase-local-stack): needs
// Postgres + pg-boss's installed schema (the scheduler enqueues the jobs this suite then hands to
// the handler, so the JOB PAYLOAD under test is the real one the scheduler produced — never a
// hand-written one). Setup mirrors scheduler.test.ts + handlers.test.ts.
//
// DEFECT (ground truth, read directly, main@4a3b3fe):
//   • services/worker/src/handlers/send-wa.ts:66 keys idempotency as
//     `send_wa:${runId}:${action.template}` — run id + template, nothing else. The lookup at
//     :67-72 returns BEFORE the var merge, BEFORE wa.send and BEFORE guard(): a silent no-op with
//     no error, no task and no log.
//   • The scheduler's own identity for the same send is step-scoped —
//     singleton_key `${runId}:${step}:${idx}` (scheduler.ts:264) — so the two dedupe layers
//     disagree and the coarser one wins.
//   • Reachable from the ordinary reminder cadence: `steps` is a keyed RECORD (schema.ts:126) with
//     no uniqueness rule on `template`, and interpret.ts:147-155 advances past the whatsapp step
//     in the same transition, so the second send is a distinct, already-committed action. The
//     scheduler enqueues two jobs; the second handler run finds the first send's usage_events row
//     and returns. Exactly-once has silently become at-most-once-per-(run, template).
//
// PINNED here:
//   1. two DIFFERENT whatsapp steps of one run that share a template BOTH send (the reminder
//      cadence), and both are metered;
//   2. an exact re-delivery of ONE of those jobs still sends nothing extra (exactly-once against
//      a pg-boss re-delivery survives the fix);
//   3. cross-tenant denial: the same job payload re-scoped to org B sends nothing — RLS hides
//      org A's run, and the handler no-ops before guard and before the send.
//
// NOT PINNED (deliberately): HOW the send is identified — this suite never writes a job payload,
//   it reads back what scheduler.enqueueJob wrote into pgboss.job and hands that verbatim to the
//   handler, so carrying step/idx (or any other per-send identity) in the payload is the worker's
//   call. The dedupe key format, the usage meta shape and the message content are not pinned.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createPool } from "@revenue-os/db";
import pg from "pg";
import { PgBoss } from "pg-boss";
import {
  handleSendWa,
  type SendWaDeps,
  type SendWaJob,
} from "../src/handlers/send-wa";
import { tick } from "../src/scheduler";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";
const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 4,
});
const appPool = createPool(DB_URL);
// pg-boss installs pgboss.* at start(); the send_wa queue must exist before the scheduler's raw
// insert into pgboss.job_common (FK to pgboss.queue), policy 'short' for the singleton_key dedupe.
const boss = new PgBoss({
  connectionString: DB_URL,
  schema: "pgboss",
  createSchema: false,
});

const TEMPLATE = "followup_1"; // ONE template, reused by two steps — the reminder cadence
const HOUR = 3_600_000;

let orgId = "";
let orgB = "";
let contactId = "";
let wfSeq = 0;
const seededRuns: string[] = [];

async function cleanup(): Promise<void> {
  await admin.query(
    `delete from usage_events where org_id in (select id from orgs where slug like 'wa-dedupe-test-%')`,
  );
  await admin.query(
    `delete from audit_log where org_id in (select id from orgs where slug like 'wa-dedupe-test-%')`,
  );
  await admin.query(`delete from orgs where slug like 'wa-dedupe-test-%'`);
}

async function seedWorkflow(def: unknown, org = orgId): Promise<string> {
  wfSeq += 1;
  const r = await admin.query(
    `insert into workflows (org_id, key, version, status, definition)
     values ($1, $2, 1, 'active', $3::jsonb) returning id`,
    [org, `wa-dedupe-wf-${Date.now()}-${wfSeq}`, JSON.stringify(def)],
  );
  return r.rows[0].id;
}

async function seedRun(
  workflowId: string,
  currentStep: string,
): Promise<string> {
  // wake_at is seeded an hour in the PAST: the run must be due against the injected host clock
  // even if the database clock runs slightly ahead of it (dueness is `wake_at <= ctx.now`).
  const r = await admin.query(
    `insert into workflow_runs
       (org_id, workflow_id, contact_id, status, current_step, state, wake_at, attempts)
     values ($1, $2, $3, 'waiting', $4, $5::jsonb, now() - interval '1 hour', '{}'::jsonb)
     returning id`,
    [
      orgId,
      workflowId,
      contactId,
      currentStep,
      JSON.stringify({ contactId, vars: { name: "Asha" } }),
    ],
  );
  const id = r.rows[0].id as string;
  seededRuns.push(id);
  return id;
}

/** The REAL job the scheduler enqueued for `<runId>:<step>:0` — payload verbatim, never authored. */
async function enqueuedJob(runId: string, step: string): Promise<SendWaJob> {
  const r = await appPool.query<{ name: string; data: SendWaJob }>(
    `select name, data from pgboss.job where singleton_key = $1`,
    [`${runId}:${step}:0`],
  );
  const row = r.rows[0];
  if (!row) throw new Error(`no job enqueued for ${runId}:${step}:0`);
  if (row.name !== "send_wa") throw new Error(`job for ${step} is ${row.name}`);
  return row.data;
}

async function countWaUsage(runId: string): Promise<number> {
  const r = await admin.query(
    `select count(*)::int n from usage_events
      where kind = 'wa_message'
        and conversation_id in (select id from conversations where workflow_run_id = $1)`,
    [runId],
  );
  return r.rows[0].n;
}

/** A reminder cadence: whatsapp(followup_1) -> wait 48h -> whatsapp(followup_1) -> end. */
const CADENCE_WF = {
  entry: "wa_1",
  steps: {
    wa_1: { kind: "whatsapp", template: TEMPLATE, then: "pause" },
    pause: { kind: "wait", for: "PT48H", then: "wa_2" },
    wa_2: { kind: "whatsapp", template: TEMPLATE, then: "end" },
    end: { kind: "end" },
  },
};

/** Counting sender + guard spy; the call log proves guard ran BEFORE each send (moat #4). */
function spyDeps(): { deps: SendWaDeps; log: string[]; templates: string[] } {
  const log: string[] = [];
  const templates: string[] = [];
  const deps: SendWaDeps = {
    pool: appPool,
    guard: async () => {
      log.push("guard");
      return { ok: true };
    },
    sender: {
      send: async (p) => {
        log.push("send");
        templates.push(p.template);
        return { providerRef: `wamid.${templates.length}` };
      },
    },
  };
  return { deps, log, templates };
}

beforeAll(async () => {
  await boss.start();
  try {
    await boss.createQueue("send_wa", { policy: "short" });
  } catch {
    // idempotent across reruns: the queue partition already exists
  }
  await cleanup();
  const org = await admin.query(
    `insert into orgs (name, slug) values ('WA Dedupe Org', $1) returning id`,
    [`wa-dedupe-test-${Date.now()}`],
  );
  orgId = org.rows[0].id;
  const b = await admin.query(
    `insert into orgs (name, slug) values ('WA Dedupe Org B', $1) returning id`,
    [`wa-dedupe-test-b-${Date.now()}`],
  );
  orgB = b.rows[0].id;
  contactId = (
    await admin.query(
      `insert into contacts (org_id, first_name) values ($1, 'Asha') returning id`,
      [orgId],
    )
  ).rows[0].id;
  await admin.query(
    `insert into contact_identities (org_id, contact_id, kind, value, is_primary)
     values ($1, $2, 'whatsapp', '+919876500001', true)`,
    [orgId, contactId],
  );
}, 30_000);

afterAll(async () => {
  for (const runId of seededRuns) {
    await appPool.query(`delete from pgboss.job where singleton_key like $1`, [
      `${runId}:%`,
    ]);
  }
  await cleanup();
  await boss.stop({ graceful: true, timeout: 5_000 });
  await appPool.end();
  await admin.end();
});

describe("send_wa dedupe is per-send, not per-template (H8)", () => {
  it("two different steps sharing ONE template both send — the reminder cadence is delivered twice", async () => {
    const wf = await seedWorkflow(CADENCE_WF);
    const runId = await seedRun(wf, "wa_1");
    const base = Date.now();

    // tick 1 drives wa_1 (send + arm the 48h wait); tick 2, 49h later, drives wa_2.
    await tick(appPool, orgId, { now: new Date(base) });
    await tick(appPool, orgId, { now: new Date(base + 49 * HOUR) });

    const job1 = await enqueuedJob(runId, "wa_1");
    const job2 = await enqueuedJob(runId, "wa_2");
    expect(job1.action.template).toBe(TEMPLATE);
    expect(job2.action.template).toBe(TEMPLATE); // same template, different step — the trap

    const { deps, log, templates } = spyDeps();
    await handleSendWa(deps, job1);
    await handleSendWa(deps, job2);

    // THE ASSERTION: two distinct sends, not one. (Today the second is silently swallowed.)
    expect(templates).toEqual([TEMPLATE, TEMPLATE]);
    expect(log).toEqual(["guard", "send", "guard", "send"]); // moat #4 held on BOTH sends
    expect(await countWaUsage(runId)).toBe(2); // both metered — two durable exactly-once markers
  }, 30_000);

  it("an exact RE-DELIVERY of one of those jobs still sends nothing extra (exactly-once)", async () => {
    const wf = await seedWorkflow(CADENCE_WF);
    const runId = await seedRun(wf, "wa_1");
    const base = Date.now();
    await tick(appPool, orgId, { now: new Date(base) });
    await tick(appPool, orgId, { now: new Date(base + 49 * HOUR) });

    const job1 = await enqueuedJob(runId, "wa_1");
    const job2 = await enqueuedJob(runId, "wa_2");
    const { deps, templates } = spyDeps();

    await handleSendWa(deps, job1);
    await handleSendWa(deps, job1); // pg-boss re-delivery of the SAME job
    await handleSendWa(deps, job2);
    await handleSendWa(deps, job2); // …and of the second

    expect(templates.length).toBe(2); // one send per STEP, re-deliveries no-op
    expect(await countWaUsage(runId)).toBe(2);
  }, 30_000);

  it("cross-tenant denial: the same job re-scoped to org B sends nothing (RLS hides A's run)", async () => {
    const wf = await seedWorkflow(CADENCE_WF);
    const runId = await seedRun(wf, "wa_1");
    await tick(appPool, orgId, { now: new Date() });
    const job1 = await enqueuedJob(runId, "wa_1");

    const { deps, log, templates } = spyDeps();
    await handleSendWa(deps, { ...job1, orgId: orgB });

    expect(templates).toEqual([]); // no send for another tenant's run
    expect(log).not.toContain("guard"); // …and the no-op happens on RELOAD, before the guard
    expect(await countWaUsage(runId)).toBe(0);
  }, 30_000);
});
