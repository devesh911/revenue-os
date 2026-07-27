// biome-ignore-all lint/suspicious/noThenProperty: `then` is a workflow step field (data, not
// a thenable) in the T26.2 definition JSON, e.g. { kind:"whatsapp", template:"...", then:"..." };
// the interpreter reads step.then. Same suppression as packages/harness/src/workflow/schema.ts.
// Task T6 (task-46) acceptance — scheduler tick + run writer. REAL-DB INTEGRATION, CI-OWNED
// (ci.yml supabase-local-stack): needs Postgres (workflow_runs + partitioned pgboss.job +
// FOR UPDATE SKIP LOCKED) and pg-boss's installed schema. These do NOT run in the worktree
// (no .env by rail) — typecheck + lint are the only env-free gates. Every `it` derives from
// exactly one acceptance criterion (labelled in its title). Correctness-critical: the
// atomicity, SKIP LOCKED, singleton_key and place_call-doesn't-advance assertions are exact.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { startRun } from "../src/runs";
import { tick } from "../src/scheduler";

// app_service is the RLS-bound backend role withOrg connects as (S1.2). Seeds + assertions use
// the superuser (admin) pool, which bypasses RLS — the functions under test use appPool.
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";
const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 4,
});
const appPool = new pg.Pool({ connectionString: DB_URL, max: 4 });
// pg-boss installs pgboss.* tables at start() (migration 015 ships only the schema). External
// actions enqueue to a queue named after the action kind (the T6->T7 contract); 'short' policy
// gives the singleton_key dedupe (job_i1: unique on (name, singleton_key) while state='created').
const boss = new PgBoss({
  connectionString: DB_URL,
  schema: "pgboss",
  createSchema: false,
});
const QUEUES = ["place_call", "send_wa"];

let orgId = "";
let contactId = "";
let wfSeq = 0;

async function cleanup(): Promise<void> {
  await admin.query(
    `delete from pgboss.job where name in ('place_call', 'send_wa')`,
  );
  // org delete cascades workflow_runs / workflows / contacts / tasks / outcomes (FK on delete cascade)
  await admin.query(`delete from orgs where slug like 'scheduler-test-%'`);
}

/** Seed a workflows row (definition jsonb) and return its id. */
async function seedWorkflow(def: unknown, org = orgId): Promise<string> {
  wfSeq += 1;
  const r = await admin.query(
    `insert into workflows (org_id, key, version, status, definition)
     values ($1, $2, 1, 'active', $3::jsonb) returning id`,
    [org, `wf-${Date.now()}-${wfSeq}`, JSON.stringify(def)],
  );
  return r.rows[0].id;
}

type RunOpts = {
  currentStep: string;
  state?: Record<string, unknown>;
  status?: string;
  wakeAt?: Date | null;
  attempts?: Record<string, unknown>;
  org?: string;
  contact?: string;
};

/** Seed a workflow_runs row (superuser, bypasses RLS) at a precise step/status/wake_at/state. */
async function seedRun(workflowId: string, opts: RunOpts): Promise<string> {
  const r = await admin.query(
    `insert into workflow_runs
       (org_id, workflow_id, contact_id, status, current_step, state, wake_at, attempts)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb) returning id`,
    [
      opts.org ?? orgId,
      workflowId,
      opts.contact ?? contactId,
      opts.status ?? "waiting",
      opts.currentStep,
      JSON.stringify(opts.state ?? { contactId }),
      opts.wakeAt === undefined ? new Date() : opts.wakeAt,
      JSON.stringify(opts.attempts ?? {}),
    ],
  );
  return r.rows[0].id;
}

async function getRun(id: string) {
  const r = await admin.query(
    `select status, current_step, state, attempts, wake_at, last_error, completed_at
       from workflow_runs where id = $1`,
    [id],
  );
  return r.rows[0];
}

/** pg-boss v12 column is singleton_key (snake_case). Returns every job row for the key. */
async function jobsFor(singletonKey: string) {
  const r = await admin.query(
    `select name, data, singleton_key from pgboss.job where singleton_key = $1`,
    [singletonKey],
  );
  return r.rows;
}

const CALL_WF = {
  entry: "c",
  steps: {
    c: { kind: "call", agent: "closer", on: { completed: "end" } },
    end: { kind: "end" },
  },
};

beforeAll(async () => {
  await boss.start();
  for (const q of QUEUES) {
    try {
      await boss.createQueue(q, { policy: "short" });
    } catch {
      // idempotent across reruns: the queue partition already exists
    }
  }
  // boss.start() (as app_service) installs + OWNS pg-boss's tables (migration 015: the migration
  // role can't own them). The admin pool is `postgres` — BYPASSRLS but NOT a superuser here — so
  // it can't SELECT/DELETE pgboss.job (jobsFor()/cleanup()) without a grant from the owner. Grant
  // it here AS app_service (appPool), the owner. Idempotent; must precede the first cleanup().
  await appPool.query(
    "grant select, delete on pgboss.job, pgboss.job_common to postgres",
  );
  await cleanup();
  const org = await admin.query(
    `insert into orgs (name, slug) values ('Scheduler Org', $1) returning id`,
    [`scheduler-test-${Date.now()}`],
  );
  orgId = org.rows[0].id;
  const c = await admin.query(
    `insert into contacts (org_id, first_name) values ($1, 'Sched Test') returning id`,
    [orgId],
  );
  contactId = c.rows[0].id;
}, 30_000);

afterAll(async () => {
  await cleanup();
  await boss.stop({ graceful: true, timeout: 5_000 });
  await appPool.end();
  await admin.end();
});

describe("scheduler tick + run writer (task-46)", () => {
  it("startRun inserts a run at the entry step: schedulable, state seeded, attempts={} [criterion 1]", async () => {
    const def = {
      entry: "hello",
      steps: {
        hello: { kind: "call", agent: "a", on: { completed: "done" } },
        done: { kind: "end" },
      },
    };
    const workflowId = await seedWorkflow(def);

    const runId = await startRun(appPool, orgId, { workflowId, contactId });

    const run = await getRun(runId);
    expect(run).toBeDefined();
    expect(run.current_step).toBe("hello"); // current_step = definition.entry
    expect(run.state.contactId).toBe(contactId); // state seeded with the contact
    expect(run.attempts).toEqual({}); // empty object — per-channel arrays fill later
    expect(["pending", "waiting"]).toContain(run.status); // schedulable; 'running' is never persisted
    expect(run.wake_at).not.toBeNull(); // due, so the criterion-2 selection can pick it up
  });

  it("tick advances a run: external action -> pgboss.job (singleton_key runId:step:idx), inline action in the SAME tx [criterion 2]", async () => {
    // whatsapp (send_wa, external) chains to a book_appointment tool (write_outcome, inline) -> end
    const def = {
      entry: "wa",
      steps: {
        wa: { kind: "whatsapp", template: "welcome", then: "book" },
        book: { kind: "tool", tool: "book_appointment", then: "end", args: {} },
        end: { kind: "end" },
      },
    };
    const workflowId = await seedWorkflow(def);
    const runId = await seedRun(workflowId, {
      currentStep: "wa",
      state: { contactId },
    });

    await tick(appPool, orgId, { now: new Date() });

    // external send_wa -> exactly one job, keyed runId:wa:0, on the send_wa queue, carrying ids + action
    const jobs = await jobsFor(`${runId}:wa:0`);
    expect(jobs.length).toBe(1);
    expect(jobs[0].name).toBe("send_wa");
    expect(jobs[0].data.orgId).toBe(orgId);
    expect(jobs[0].data.runId).toBe(runId);
    expect(jobs[0].data.action.kind).toBe("send_wa");

    // inline write_outcome applied in the SAME tx (no extra job hop) -> outcomes row on the run
    const oc = await admin.query(
      `select kind, contact_id, workflow_run_id from outcomes where workflow_run_id = $1`,
      [runId],
    );
    expect(oc.rows.length).toBe(1);
    expect(oc.rows[0].kind).toBe("site_visit_booked");
    expect(oc.rows[0].contact_id).toBe(contactId);

    // and the run advanced (book_appointment -> end -> completed)
    expect((await getRun(runId)).status).toBe("completed");
  });

  it("tick is atomic: a failure mid-advance rolls back the enqueue too — one commit or none [criterion 2 atomicity]", async () => {
    // positive control: a healthy run proves the tick actually enqueues (guards vs a silent no-op)
    const healthyWf = await seedWorkflow(CALL_WF);
    const healthyRun = await seedRun(healthyWf, {
      currentStep: "c",
      state: { contactId },
    });
    await tick(appPool, orgId, { now: new Date() });
    expect((await jobsFor(`${healthyRun}:c:0`)).length).toBe(1); // tick works -> one place_call job

    // atomicity subject: whatsapp (enqueue send_wa) then a create_task whose kind violates the
    // tasks CHECK constraint -> the inline insert aborts the per-run tx AFTER the enqueue.
    const poisonWf = await seedWorkflow({
      entry: "wa",
      steps: {
        wa: { kind: "whatsapp", template: "welcome", then: "boom" },
        boom: {
          kind: "tool",
          tool: "create_task",
          then: "end",
          args: { kind: "__invalid__", title: "x" },
        },
        end: { kind: "end" },
      },
    });
    const poisonRun = await seedRun(poisonWf, {
      currentStep: "wa",
      state: { contactId },
    });

    // the tick may reject (DB error propagates) or fail-the-run; either way NOTHING may commit
    await tick(appPool, orgId, { now: new Date() }).catch(() => undefined);

    expect((await jobsFor(`${poisonRun}:wa:0`)).length).toBe(0); // enqueue rolled back with the failed advance
    const tasks = await admin.query(
      `select id from tasks where workflow_run_id = $1`,
      [poisonRun],
    );
    expect(tasks.rows.length).toBe(0); // inline write rolled back too
    const run = await getRun(poisonRun);
    expect(run.current_step).toBe("wa"); // run did NOT advance
    expect(run.status).not.toBe("completed");
  });

  it("place_call PARKS the run: waiting, current_step unchanged, one voice attempt recorded [criterion 3]", async () => {
    const workflowId = await seedWorkflow(CALL_WF);
    const runId = await seedRun(workflowId, {
      currentStep: "c",
      state: { contactId },
    });

    await tick(appPool, orgId, { now: new Date() });

    const run = await getRun(runId);
    expect(run.current_step).toBe("c"); // place_call does NOT advance — disposition unknown until the provider reports
    expect(run.status).toBe("waiting"); // parked
    expect(Array.isArray(run.attempts.voice)).toBe(true);
    expect(run.attempts.voice.length).toBe(1); // one voice timestamp (attempts is a per-channel array, not a counter)

    const jobs = await jobsFor(`${runId}:c:0`);
    expect(jobs.length).toBe(1);
    expect(jobs[0].name).toBe("place_call");
    expect(jobs[0].data.action.kind).toBe("place_call");
  });

  it("send_wa ADVANCES in the same tick and appends a whatsapp attempt timestamp [criterion 3]", async () => {
    // whatsapp emits send_wa AND arms the next step in one transition; here it chains to a 2h wait
    const def = {
      entry: "wa",
      steps: {
        wa: { kind: "whatsapp", template: "welcome", then: "pause" },
        pause: { kind: "wait", for: "PT2H", then: "done" },
        done: { kind: "end" },
      },
    };
    const workflowId = await seedWorkflow(def);
    const runId = await seedRun(workflowId, {
      currentStep: "wa",
      state: { contactId },
    });
    const now = new Date();

    await tick(appPool, orgId, { now });

    const run = await getRun(runId);
    expect(run.current_step).not.toBe("wa"); // advanced past the whatsapp step in ONE tick
    expect(run.current_step).toBe("done"); // the wait's `then` — where the run now points
    expect(run.status).toBe("waiting"); // parked on the wait
    expect(new Date(run.wake_at).getTime()).toBeGreaterThan(now.getTime()); // the 2h wait was armed
    expect(Array.isArray(run.attempts.whatsapp)).toBe(true);
    expect(run.attempts.whatsapp.length).toBe(1); // whatsapp attempt timestamp appended

    const jobs = await jobsFor(`${runId}:wa:0`);
    expect(jobs.length).toBe(1);
    expect(jobs[0].name).toBe("send_wa");
  });

  it("singleton_key dedupes: two ticks over the same due run enqueue EXACTLY ONE job [criterion 4]", async () => {
    const workflowId = await seedWorkflow(CALL_WF);
    const runId = await seedRun(workflowId, {
      currentStep: "c",
      state: { contactId },
    });

    await tick(appPool, orgId, { now: new Date() }); // tick 1 -> enqueues place_call (runId:c:0), run parks

    // re-arm the run at the SAME step (a retry / re-poll of the still-parked call step)
    await admin.query(
      `update workflow_runs set wake_at = now(), status = 'waiting' where id = $1`,
      [runId],
    );
    // tick 2 must NOT throw — the duplicate enqueue conflicts on singleton_key and no-ops
    await expect(
      tick(appPool, orgId, { now: new Date() }),
    ).resolves.toBeDefined();

    expect((await jobsFor(`${runId}:c:0`)).length).toBe(1); // still exactly one job
  });

  it("FOR UPDATE SKIP LOCKED: a run locked by a concurrent tx is skipped, not double-processed [criterion 5]", async () => {
    const workflowId = await seedWorkflow(CALL_WF);
    const runId = await seedRun(workflowId, {
      currentStep: "c",
      state: { contactId },
    });

    // hold a row lock on the run in a separate tx (stands in for a concurrent tick mid-flight)
    const holder = await admin.connect();
    try {
      await holder.query("begin");
      await holder.query(
        `select id from workflow_runs where id = $1 for update`,
        [runId],
      );

      await tick(appPool, orgId, { now: new Date() }); // must SKIP the locked row

      expect((await jobsFor(`${runId}:c:0`)).length).toBe(0); // not processed while locked
      const run = await getRun(runId);
      expect(run.current_step).toBe("c");
      expect(run.attempts.voice ?? []).toEqual([]); // no voice attempt — the run was skipped, not touched
    } finally {
      await holder.query("rollback");
      holder.release();
    }

    // once the lock is released the SAME run processes normally — it was skipped, not dropped
    await tick(appPool, orgId, { now: new Date() });
    expect((await jobsFor(`${runId}:c:0`)).length).toBe(1);
  });

  it("dangling then/on target: interpret throws 'unknown step' -> the run is FAILED, the tick does NOT throw [criterion 6]", async () => {
    // whatsapp chains to run('ghost'); 'ghost' is absent -> interpret throws before any transition
    const def = {
      entry: "wa",
      steps: { wa: { kind: "whatsapp", template: "welcome", then: "ghost" } },
    };
    const workflowId = await seedWorkflow(def);
    const runId = await seedRun(workflowId, {
      currentStep: "wa",
      state: { contactId },
    });

    // one bad run must NOT crash the tick
    await expect(
      tick(appPool, orgId, { now: new Date() }),
    ).resolves.toBeDefined();

    const run = await getRun(runId);
    expect(run.status).toBe("failed"); // fail-the-run / dead-letter
    expect(String(run.last_error)).toContain("unknown step"); // the interpreter's message, captured
    expect((await jobsFor(`${runId}:wa:0`)).length).toBe(0); // threw before any transition -> nothing enqueued
  });

  it("clock seam: the injected ctx.now decides dueness (the M2 SimClock drives the tick) [criterion 7]", async () => {
    const workflowId = await seedWorkflow(CALL_WF);
    const wakeAt = new Date("2030-01-01T12:00:00.000Z"); // far from the wall clock — only ctx.now can matter
    const runId = await seedRun(workflowId, {
      currentStep: "c",
      state: { contactId },
      wakeAt,
    });

    // now BEFORE wake_at -> not due -> nothing happens
    await tick(appPool, orgId, { now: new Date(wakeAt.getTime() - 60_000) });
    expect((await jobsFor(`${runId}:c:0`)).length).toBe(0);
    expect((await getRun(runId)).current_step).toBe("c");

    // now AFTER wake_at -> due -> processed
    await tick(appPool, orgId, { now: new Date(wakeAt.getTime() + 60_000) });
    expect((await jobsFor(`${runId}:c:0`)).length).toBe(1);
  });

  it("tenancy: tick(orgA) never processes another org's due run [cross-tenant denial]", async () => {
    // org B with its own due run — withOrg(orgA) must not see or advance it
    const orgB = (
      await admin.query(
        `insert into orgs (name, slug) values ('Scheduler Org B', $1) returning id`,
        [`scheduler-test-b-${Date.now()}`],
      )
    ).rows[0].id;
    const contactB = (
      await admin.query(
        `insert into contacts (org_id, first_name) values ($1, 'B') returning id`,
        [orgB],
      )
    ).rows[0].id;
    const wfB = await seedWorkflow(CALL_WF, orgB);
    const runB = await seedRun(wfB, {
      currentStep: "c",
      state: { contactId: contactB },
      org: orgB,
      contact: contactB,
    });

    await tick(appPool, orgId, { now: new Date() }); // tick scoped to org A

    expect((await jobsFor(`${runB}:c:0`)).length).toBe(0); // org B's run untouched
    const rb = await getRun(runB);
    expect(rb.current_step).toBe("c");
    expect(rb.attempts.voice ?? []).toEqual([]);
  });

  it("advancing OUT of a `call` step CLEARS state.lastDisposition so the next call is FRESH (M2 P0) [T7 criterion 6: lastDisposition-clear]", async () => {
    // call_1 got 'no_answer' (the handler folded it). This tick routes call_1 -> call_2. The
    // scheduler MUST clear lastDisposition on advance; else call_2 RE-ENTERS on the STALE
    // 'no_answer' (routing to giveup -> end -> completed) instead of placing a FRESH call.
    const def = {
      entry: "call_1",
      steps: {
        call_1: {
          kind: "call",
          agent: "closer",
          on: { no_answer: "call_2", completed: "book" },
        },
        call_2: {
          kind: "call",
          agent: "closer",
          on: { no_answer: "giveup", completed: "book" },
        },
        book: { kind: "tool", tool: "book_appointment", then: "end", args: {} },
        giveup: { kind: "end" },
        end: { kind: "end" },
      },
    };
    const workflowId = await seedWorkflow(def);
    const runId = await seedRun(workflowId, {
      currentStep: "call_1",
      state: { contactId, lastDisposition: "no_answer" }, // call_1 re-entry
    });

    await tick(appPool, orgId, { now: new Date() });

    const run = await getRun(runId);
    // call_1(no_answer) routed to call_2, and call_2 — being FRESH — placed a call and parked
    expect(run.current_step).toBe("call_2");
    expect(run.status).toBe("waiting");
    // THE P0 ASSERTION: the stale disposition was CLEARED on advance (call_2 saw NO disposition)
    expect(run.state.lastDisposition ?? null).toBeNull();
    // proof call_2 saw a FRESH call — a place_call job for call_2, not a stale route to giveup
    expect((await jobsFor(`${runId}:call_2:0`)).length).toBe(1);
    expect(Array.isArray(run.attempts.voice)).toBe(true);
    expect(run.attempts.voice.length).toBe(1); // one place_call attempt, for call_2
  });
});
