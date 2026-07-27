// Task T8 (task-48) — worker WIRING, integration half. Criteria 3 (startJobs registers the action
// queues + a call.post dead-letter queue) + 4 (the scheduler tick is scheduled to run periodically).
// REAL-DB INTEGRATION, CI-OWNED (ci.yml supabase-local-stack): needs Postgres + pg-boss's installed
// schema. It does NOT run in the worktree (no .env by rail) — typecheck + lint are its only worktree
// gates. Setup mirrors scheduler.test.ts / vapi-queue.test.ts: real pg-boss over the local DB as the
// app_service role (mocks lie — tech-stack testing L2).
//
// startJobs() is the unit under test, so we NEVER create the queues/schedule ourselves — we inspect
// pgboss.queue / pgboss.schedule after it runs. app_service OWNS those tables (boss.start installs
// them inside migration 015's schema), so this pool reads them without a grant. Per the brief we
// assert STRUCTURE only (the queues/schedule row exist, startJobs resolves) — never async boss.work
// dispatch or cron firing, both of which are timing-flaky.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { startJobs, stopJobs } from "../src/jobs";
import { ACTION_QUEUES } from "../src/scheduler";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";
const appPool = new pg.Pool({ connectionString: DB_URL, max: 2 });

// The T8 dead-letter sink queue (handleCallPost drains it): place_call's createQueue names it as its
// deadLetter, and it must exist as its own queue.
const CALL_POST_QUEUE = "call.post";
// The T8 periodic tick, scheduled via pg-boss (durable + HA across restarts, unlike a per-process
// setInterval that a redeploy would silently drop).
const TICK_QUEUE = "scheduler.tick";

beforeAll(async () => {
  // createSchema:false — startJobs relies on migration 015's pgboss schema; boss.start() then installs
  // the TABLES within it. Idempotent across the shared boss singleton other suites may have started.
  await startJobs();
}, 30_000); // cold start installs pg-boss's schema objects

afterAll(async () => {
  await stopJobs();
  await appPool.end();
});

async function queueNames(): Promise<Set<string>> {
  const r = await appPool.query<{ name: string }>(
    `select name from pgboss.queue`,
  );
  return new Set(r.rows.map((row) => row.name));
}

describe("T8 startJobs wires the action queues + dead-letter sink [criterion 3]", () => {
  it("creates place_call / send_wa / run_agent_turn (policy 'short') + a call.post queue", async () => {
    const names = await queueNames();
    for (const q of ACTION_QUEUES) {
      expect(names.has(q)).toBe(true); // each external-action queue exists
    }
    expect(names.has(CALL_POST_QUEUE)).toBe(true); // the dead-letter sink exists

    // the action queues MUST be policy 'short': the T6 singleton_key dedup rides pgboss.job's job_i1
    // index (state='created' AND policy='short'), and scheduler.enqueueJob writes policy 'short' — a
    // queue on any other policy would break exactly-once. (pg-boss stores the policy string verbatim.)
    const pol = await appPool.query<{ name: string; policy: string }>(
      `select name, policy from pgboss.queue where name = any($1)`,
      [[...ACTION_QUEUES]],
    );
    expect(pol.rows.length).toBe(ACTION_QUEUES.length);
    for (const row of pol.rows) {
      expect(row.policy).toBe("short");
    }
  });

  it("startJobs() resolves — the worker boots (idempotent; boot-green is key-agnostic)", async () => {
    // a second call no-ops on the boss singleton; the point is that it RESOLVES, never throws. The
    // boot-WITHOUT-ANTHROPIC_API_KEY guarantee is unit-pinned in wiring-unit.test.ts (criterion 2):
    // the env singleton is import-frozen, so the no-key branch cannot be flipped mid-process here.
    await expect(startJobs()).resolves.toBeUndefined();
  });
});

describe("T8 schedules the scheduler tick to run periodically [criterion 4]", () => {
  it("registers a pg-boss schedule (a pgboss.schedule row) on the scheduler.tick queue", async () => {
    // observable of "runs periodically": a durable cron row in pgboss.schedule. The mechanism
    // (pg-boss schedule vs setInterval) is the worker's choice; we pin the durable, HA one so the
    // schedule survives a restart and is inspectable. The schedule references a real queue.
    const names = await queueNames();
    expect(names.has(TICK_QUEUE)).toBe(true); // the schedule targets a real queue

    const sched = await appPool.query<{ name: string; cron: string }>(
      `select name, cron from pgboss.schedule where name = $1`,
      [TICK_QUEUE],
    );
    expect(sched.rows.length).toBe(1); // the tick IS scheduled
    expect(typeof sched.rows[0]?.cron).toBe("string");
    expect((sched.rows[0]?.cron ?? "").length).toBeGreaterThan(0); // a non-empty cron expression
  });
});
