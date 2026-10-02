// Four test runs started at the same moment all pass, and neither they nor a demo run delete data they did not
// create: another company's rows and queued calls, and the dev login's workspace, are all still there afterwards.
// Test start-up used to rewrite the database login on every run (runs started together died with "tuple
// concurrently updated"), and test clean-ups deleted every company's queued calls and companies by name.
import { afterAll, beforeAll, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { testCompanies } from "../../../tests/test-companies";

const repo = join(import.meta.dir, "../../..");
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";
const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});
const app = new pg.Pool({ connectionString: DB_URL, max: 2 }); // owns pg-boss's tables
const companies = testCompanies(admin, app);
const QUEUES = ["place_call", "send_wa"];

// Test files that used to delete other companies' data: by a fixed name, by a name prefix, every company's
// queued calls, or the dev login's workspace.
const FILES = [
  "packages/db/test/rls.test.ts",
  "services/worker/test/scheduler.test.ts",
  "services/worker/test/m2-replay.test.ts",
  "services/worker/test/demo-driver.test.ts",
  "services/worker/test/send-wa-step-dedupe.test.ts",
  "services/worker/test/vapi-webhook.test.ts",
  "scripts/dev-login.test.ts",
];

let other = "";
let devWorkspaces: unknown[] = [];

const devWorkspace = async () =>
  (
    await admin.query(
      `select id from orgs where slug in ('seed-real-estate', 'seed-b2b-wholesale') order by id`,
    )
  ).rows;

/** What the other company holds: its row, a contact, an audit and a usage row, and its queued calls. */
const holdings = async () => ({
  ...(
    await admin.query(
      `select (select count(*)::int from orgs where id = $1) org,
              (select count(*)::int from contacts where org_id = $1) contacts,
              (select count(*)::int from audit_log where org_id = $1) audit,
              (select count(*)::int from usage_events where org_id = $1) usage`,
      [other],
    )
  ).rows[0],
  jobs: (
    await app.query(
      `select name from pgboss.job where data ->> 'orgId' = $1 order by name`,
      [other],
    )
  ).rows.map((r) => r.name),
});

/** Runs bun with `args` from the repo root, as this run is configured; resolves to its exit code and output. */
const bun = (args: string[]) =>
  new Promise<{ code: number | null; out: string }>((done) => {
    const child = spawn(process.execPath, args, { cwd: repo });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      out += d;
    });
    child.on("close", (code) => done({ code, out }));
  });

beforeAll(async () => {
  // pg-boss installs its tables on start; each queue needs its partition before a job can land in it.
  const boss = new PgBoss({
    connectionString: DB_URL,
    schema: "pgboss",
    createSchema: false,
  });
  await boss.start();
  for (const q of QUEUES)
    await boss.createQueue(q, { policy: "short" }).catch(() => {}); // already there
  await boss.stop({ graceful: true, timeout: 5_000 });

  other = (await companies.add("Other company")).id;
  await admin.query(
    `insert into contacts (org_id, first_name) values ($1, 'Not yours')`,
    [other],
  );
  await admin.query(
    `insert into audit_log (org_id, actor_type, action) values ($1, 'system', 'test.isolation')`,
    [other],
  );
  await admin.query(
    `insert into usage_events (org_id, kind, provider, quantity, unit, cost_usd)
     values ($1, 'llm', 'fake', 1, 'tokens', 0)`,
    [other],
  );
  // Queued far in the future, so a worker running on this machine never picks them up.
  for (const name of QUEUES)
    await app.query(
      `insert into pgboss.job_common (name, data, singleton_key, policy, start_after)
       values ($1, $2::jsonb, $3, 'short', '2100-01-01')`,
      [name, JSON.stringify({ orgId: other }), randomUUID()],
    );
  devWorkspaces = await devWorkspace();
}, 30_000);

afterAll(async () => {
  await companies.cleanup();
  await app.end();
  await admin.end();
});

it("four runs started at once all pass, and they and a demo run leave another company's data alone", async () => {
  const runs = await Promise.all([
    ...[1, 2, 3, 4].map(() => bun(["test", ...FILES])),
    bun(["scripts/demo.ts"]),
  ]);
  // A failed run shows the end of its output.
  expect(runs.map((r) => (r.code === 0 ? "" : r.out.slice(-3000)))).toEqual([
    "",
    "",
    "",
    "",
    "",
  ]);
  expect(await holdings()).toEqual({
    org: 1,
    contacts: 1,
    audit: 1,
    usage: 1,
    jobs: QUEUES,
  });
  expect(await devWorkspace()).toEqual(devWorkspaces);
}, 180_000);
