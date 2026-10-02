// The worker's job wiring, against the real local database: startJobs registers the action queues and a call.post
// dead-letter queue, and schedules the scheduler tick to run periodically. Real pg-boss as the app_service role, as
// in scheduler.test.ts and vapi-queue.test.ts (mocks lie).
//
// startJobs() is the unit under test, so we NEVER create the queues/schedule ourselves — we inspect the queue and
// schedule tables after it runs. It runs in a pg-boss schema of this test's own (fixtures/test-job-schema.ts), which
// app_service owns what it creates in, as in migration 015's `pgboss`: the runner it starts never works another
// company's queued jobs, and with no clock it never ticks every company's due runs. We assert STRUCTURE only (the
// queues/schedule row exist, startJobs resolves) — never async boss.work dispatch or cron firing, both of which are
// timing-flaky.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { startJobs, stopJobs } from "../src/jobs";
import { ACTION_QUEUES } from "../src/scheduler";
import { testJobSchema } from "./fixtures/test-job-schema";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";
const appPool = new pg.Pool({ connectionString: DB_URL, max: 2 });
const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 1,
});
let jobs: Awaited<ReturnType<typeof testJobSchema>>;

// The dead-letter sink queue (handleCallPost drains it): place_call's createQueue names it as its deadLetter, and
// it must exist as its own queue.
const CALL_POST_QUEUE = "call.post";
// The periodic tick, scheduled via pg-boss (durable and shared across restarts, unlike a per-process setInterval
// that a redeploy would silently drop).
const TICK_QUEUE = "scheduler.tick";

beforeAll(async () => {
  jobs = await testJobSchema(admin);
  // createSchema:false — startJobs relies on the schema existing; boss.start() then installs the TABLES within it.
  await startJobs(jobs.settings);
}, 30_000); // cold start installs pg-boss's schema objects

afterAll(async () => {
  await stopJobs();
  await jobs.drop();
  await appPool.end();
  await admin.end();
});

async function queueNames(): Promise<Set<string>> {
  const r = await appPool.query<{ name: string }>(
    `select name from ${jobs.settings.schema}.queue`,
  );
  return new Set(r.rows.map((row) => row.name));
}

describe("startJobs wires the action queues and the dead-letter sink", () => {
  it("creates place_call / send_wa / run_agent_turn (policy 'short') + a call.post queue", async () => {
    const names = await queueNames();
    for (const q of ACTION_QUEUES) {
      expect(names.has(q)).toBe(true); // each external-action queue exists
    }
    expect(names.has(CALL_POST_QUEUE)).toBe(true); // the dead-letter sink exists

    // the action queues MUST be policy 'short': the scheduler's singleton_key dedup rides pgboss.job's job_i1
    // index (state='created' AND policy='short'), and scheduler.enqueueJob writes policy 'short' — a queue on any
    // other policy would break exactly-once. (pg-boss stores the policy string verbatim.)
    const pol = await appPool.query<{ name: string; policy: string }>(
      `select name, policy from ${jobs.settings.schema}.queue where name = any($1)`,
      [[...ACTION_QUEUES]],
    );
    expect(pol.rows.length).toBe(ACTION_QUEUES.length);
    for (const row of pol.rows) {
      expect(row.policy).toBe("short");
    }
  });

  it("startJobs() resolves — the worker boots (idempotent; boot-green is key-agnostic)", async () => {
    // a second call no-ops on the boss singleton; the point is that it RESOLVES, never throws. Booting WITHOUT
    // ANTHROPIC_API_KEY is pinned in wiring-unit.test.ts: the env singleton is frozen at import, so the no-key
    // branch cannot be flipped mid-process here.
    await expect(startJobs(jobs.settings)).resolves.toBeUndefined();
  });
});

describe("startJobs schedules the scheduler tick to run periodically", () => {
  it("registers a pg-boss schedule (a schedule row) on the scheduler.tick queue", async () => {
    // observable of "runs periodically": a durable cron row in the schedule table. The mechanism (pg-boss
    // schedule vs setInterval) is the worker's choice; we pin the durable one so the schedule survives a restart
    // and is inspectable. The schedule references a real queue.
    const names = await queueNames();
    expect(names.has(TICK_QUEUE)).toBe(true); // the schedule targets a real queue

    const sched = await appPool.query<{ name: string; cron: string }>(
      `select name, cron from ${jobs.settings.schema}.schedule where name = $1`,
      [TICK_QUEUE],
    );
    expect(sched.rows.length).toBe(1); // the tick IS scheduled
    expect(typeof sched.rows[0]?.cron).toBe("string");
    expect((sched.rows[0]?.cron ?? "").length).toBeGreaterThan(0); // a non-empty cron expression
  });
});
