// biome-ignore-all lint/suspicious/noThenProperty: `then` is a workflow step FIELD (data, not a
// thenable) in the T26.2 definition JSON — same suppression as scheduler.test.ts.
// H5 (hole audit, Package 2 / task-58) — RED spec: a run poisoned in the APPLY phase must reach a
// TERMINAL state, not retry forever. REAL-DB INTEGRATION, CI-OWNED (ci.yml supabase-local-stack):
// needs Postgres (workflow_runs + tasks + FOR UPDATE SKIP LOCKED). No pg-boss here — the poison
// definition emits only INLINE actions, so nothing is enqueued. Setup mirrors scheduler.test.ts.
//
// DEFECT (ground truth, read directly, main@4a3b3fe):
//   • services/worker/src/scheduler.ts dead-letters in PHASE 1 ONLY (:140-148 — a definition that
//     fails to parse or dangles becomes status='failed' + last_error). A PHASE 2 failure (:153
//     applyTransitions) propagates out of processRun, withOrg ROLLS THE WHOLE TX BACK
//     (packages/db/src/client.ts:32-38), and tick catches it at :87-96, logs
//     "tick: run apply rolled back", and `continue`s.
//   • The rollback restores status='waiting' with the SAME wake_at — still <= now — so the very
//     next tick re-selects the run (:71-75). Nothing counts apply failures, applies backoff, or
//     ever transitions the run to a terminal status. The tick is scheduled every minute
//     (services/worker/src/jobs.ts:170), so ONE poisoned run burns a tick slot and logs an error
//     every minute FOREVER, and never becomes visible to an operator as a failed run.
//   • Reachable from a schema-VALID definition: interpret.ts:173 routes every non-book_appointment
//     tool to create_task, and tasks.kind/title are `not null` with a 5-value CHECK
//     (supabase/migrations/006_harness.sql:87,90).
//
// FAULT INJECTION (why a trigger): H7's fix validates action payloads, which closes the specific
//   `task:{}` trigger the audit used. The defect under test here is the SCHEDULER's handling of
//   ANY deterministic apply failure, so the fault is injected at the DB with a BEFORE INSERT
//   trigger that raises check_violation (23514 — the same SQLSTATE class the audit describes) for
//   one sentinel title. It is created and dropped by this suite and fires for nothing else.
//
// PINNED here:
//   1. a run whose apply phase throws deterministically reaches a TERMINAL state within a bounded
//      number of ticks — a status the scheduler's own selection (:73) can never pick up again —
//      and carries an operator-visible reason (last_error);
//   2. nothing partial commits along the way (the rolled-back inline write never lands);
//   3. the retry posture survives: a run that fails apply ONCE and then succeeds is NOT
//      dead-lettered — it advances normally (STATE.md DECISIONS "T6 scheduler DB-error policy":
//      a DB error rolls back and the run is retried; only a POISON run may terminate);
//   4. cross-tenant denial: ticking org A never dead-letters (or otherwise touches) org B's run.
//
// NOT PINNED (deliberately): the terminal status STRING ('failed' vs another terminal value), the
//   attempt ceiling N (anything ≤ MAX_TICKS below), whether the fix uses a counter, a backoff, or
//   wake_at arithmetic, where the counter is stored, and the last_error wording. Ticks advance the
//   injected clock by an hour each so a backoff-then-terminate fix is not failed on timing.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { tick } from "../src/scheduler";

const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 4,
});
const appPool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres",
  max: 4,
});

/** The statuses the scheduler's selection query can pick up (scheduler.ts:73). */
const SCHEDULABLE = ["pending", "waiting"];
/** The ceiling: a poisoned run must be terminal by here. The real N is the worker's call. */
const MAX_TICKS = 12;
/** Only tasks with this title prefix trip the injected fault. */
const POISON_TITLE = "POISON-t58 apply always fails";

let orgId = "";
let orgB = "";
let contactId = "";
let contactB = "";
let wfSeq = 0;

async function cleanup(): Promise<void> {
  await admin.query(`delete from orgs where slug like 'apply-poison-test-%'`);
}

async function seedWorkflow(def: unknown, org = orgId): Promise<string> {
  wfSeq += 1;
  const r = await admin.query(
    `insert into workflows (org_id, key, version, status, definition)
     values ($1, $2, 1, 'active', $3::jsonb) returning id`,
    [org, `poison-wf-${Date.now()}-${wfSeq}`, JSON.stringify(def)],
  );
  return r.rows[0].id;
}

async function seedRun(
  workflowId: string,
  opts: { currentStep: string; org?: string; contact?: string },
): Promise<string> {
  const contact = opts.contact ?? contactId;
  // wake_at an hour in the PAST: the run must be due against the injected host clock even if the
  // database clock runs slightly ahead of it (dueness is `wake_at <= ctx.now`).
  const r = await admin.query(
    `insert into workflow_runs
       (org_id, workflow_id, contact_id, status, current_step, state, wake_at, attempts)
     values ($1, $2, $3, 'waiting', $4, $5::jsonb, now() - interval '1 hour', '{}'::jsonb)
     returning id`,
    [
      opts.org ?? orgId,
      workflowId,
      contact,
      opts.currentStep,
      JSON.stringify({ contactId: contact }),
    ],
  );
  return r.rows[0].id;
}

async function getRun(id: string) {
  const r = await admin.query(
    `select status, current_step, wake_at, last_error, completed_at
       from workflow_runs where id = $1`,
    [id],
  );
  return r.rows[0];
}

async function countTasks(runId: string): Promise<number> {
  const r = await admin.query(
    `select count(*)::int n from tasks where workflow_run_id = $1`,
    [runId],
  );
  return r.rows[0].n;
}

/** A one-step flow whose create_task insert is guaranteed to fail (see FAULT INJECTION above). */
function poisonDef(title = POISON_TITLE) {
  return {
    entry: "t",
    steps: {
      t: {
        kind: "tool",
        tool: "notify_owner",
        args: { kind: "callback", title },
        then: "end",
      },
      end: { kind: "end" },
    },
  };
}

/** Tick `count` times, one simulated hour apart, and report the run's status after each. */
async function tickUntilTerminal(
  runId: string,
  org: string,
  count = MAX_TICKS,
): Promise<string[]> {
  const base = Date.now();
  const seen: string[] = [];
  for (let i = 0; i < count; i++) {
    await tick(appPool, org, { now: new Date(base + i * 3_600_000) });
    const run = await getRun(runId);
    seen.push(run.status);
    if (!SCHEDULABLE.includes(run.status)) break;
  }
  return seen;
}

beforeAll(async () => {
  await cleanup();
  // Fault injection: a deterministic, constraint-class apply failure that no definition-level
  // validation can prevent. Dropped in afterAll; matches only this suite's sentinel title.
  await admin.query(`
    create or replace function t58_poison_task() returns trigger language plpgsql as $$
    begin
      if new.title like 'POISON-t58%' then
        raise exception 'poisoned task insert (task-58 fault injection)'
          using errcode = '23514';
      end if;
      return new;
    end $$;
  `);
  await admin.query(`drop trigger if exists t58_poison_task on tasks`);
  await admin.query(`
    create trigger t58_poison_task before insert on tasks
      for each row execute function t58_poison_task()
  `);

  const org = await admin.query(
    `insert into orgs (name, slug) values ('Apply Poison Org', $1) returning id`,
    [`apply-poison-test-${Date.now()}`],
  );
  orgId = org.rows[0].id;
  const b = await admin.query(
    `insert into orgs (name, slug) values ('Apply Poison Org B', $1) returning id`,
    [`apply-poison-test-b-${Date.now()}`],
  );
  orgB = b.rows[0].id;
  contactId = (
    await admin.query(
      `insert into contacts (org_id, first_name) values ($1, 'Poison A') returning id`,
      [orgId],
    )
  ).rows[0].id;
  contactB = (
    await admin.query(
      `insert into contacts (org_id, first_name) values ($1, 'Poison B') returning id`,
      [orgB],
    )
  ).rows[0].id;
}, 30_000);

afterAll(async () => {
  await cleanup();
  await admin.query(`drop trigger if exists t58_poison_task on tasks`);
  await admin.query(`drop function if exists t58_poison_task()`);
  await appPool.end();
  await admin.end();
});

describe("apply-phase poison runs terminate (H5)", () => {
  it("a run whose APPLY phase throws every tick reaches a TERMINAL state, not an endless retry", async () => {
    const wf = await seedWorkflow(poisonDef());
    const runId = await seedRun(wf, { currentStep: "t" });

    const statuses = await tickUntilTerminal(runId, orgId);

    const run = await getRun(runId);
    // THE ASSERTION: the run is in a status the scheduler's selection can never pick up again.
    expect({
      terminal: !SCHEDULABLE.includes(run.status),
      status: run.status,
      ticks: statuses.length,
    }).toMatchObject({ terminal: true });
    // …with a reason a human can see in the console (the dead-letter contract, scheduler.ts:8-10).
    expect(run.last_error).not.toBeNull();
    // …and nothing partial ever committed: every poisoned apply rolled its whole tx back.
    expect(await countTasks(runId)).toBe(0);
  }, 30_000);

  it("the tick keeps going and never throws while a poisoned run is burning down", async () => {
    // criterion 6 of task-46 must survive the fix: one bad run may not abort the tick.
    const wf = await seedWorkflow(poisonDef());
    await seedRun(wf, { currentStep: "t" });
    await expect(
      tick(appPool, orgId, { now: new Date() }),
    ).resolves.toBeDefined();
  }, 30_000);

  it("retry posture preserved: ONE apply failure is retried, not dead-lettered", async () => {
    // STATE.md DECISIONS (T6 scheduler DB-error policy): a failed inline write rolls back and the
    // run is RETRIED. A transient DB error must not become a terminal run on its first occurrence.
    const wf = await seedWorkflow(poisonDef());
    const runId = await seedRun(wf, { currentStep: "t" });
    const base = Date.now();

    await tick(appPool, orgId, { now: new Date(base) }); // apply fails once
    const afterFailure = await getRun(runId);
    expect({
      stillSchedulable: SCHEDULABLE.includes(afterFailure.status),
      status: afterFailure.status,
    }).toMatchObject({ stillSchedulable: true });

    // the failure clears (stands in for a transient DB error resolving) — same run, same step
    await admin.query(
      `update workflows set definition = $2::jsonb where id = $1`,
      [wf, JSON.stringify(poisonDef("Ring Asha back"))],
    );
    await admin.query(
      `update workflow_runs set wake_at = $2 where id = $1 and status in ('pending','waiting')`,
      [runId, new Date(base + 3_600_000)],
    );

    await tick(appPool, orgId, { now: new Date(base + 7_200_000) });

    const run = await getRun(runId);
    expect(run.status).toBe("completed"); // the run advanced — it was never dead-lettered
    expect(await countTasks(runId)).toBe(1); // and the inline write landed exactly once
  }, 30_000);

  it("cross-tenant denial: ticking org A never terminates (or touches) org B's poisoned run", async () => {
    const wfB = await seedWorkflow(poisonDef(), orgB);
    const runB = await seedRun(wfB, {
      currentStep: "t",
      org: orgB,
      contact: contactB,
    });
    const wfA = await seedWorkflow(poisonDef());
    const runA = await seedRun(wfA, { currentStep: "t" });

    await tickUntilTerminal(runA, orgId); // ticks scoped to org A only

    const b = await getRun(runB);
    expect(b.status).toBe("waiting"); // untouched by another tenant's tick
    expect(b.last_error).toBeNull();
    expect(b.completed_at).toBeNull();
    expect(await countTasks(runB)).toBe(0);
  }, 30_000);
});
