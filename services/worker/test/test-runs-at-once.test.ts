// Four runs of the whole test suite started at the same moment all pass, and neither they nor a demo run touch
// data they did not create: another company's rows and queued calls (due now, so any job runner a test starts
// would take them) and the dev login's workspaces are all as they were afterwards. Each run is the whole suite as
// `bun test` finds it, but this file, so a new test file is in the proof the moment it exists.
// Test start-up used to rewrite the database login on every run (runs started together died with "tuple
// concurrently updated"), test clean-ups deleted every company's queued calls and companies by name, the job
// runner two tests start worked every company's queued jobs, and a dev-login test reseeded the dev workspace.
// It assumes no worker (`bun run dev`) is running on this machine: one works every company's due jobs.
import { afterAll, beforeAll, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { type Pack, seed } from "../../../scripts/seed";
import { testCompanies } from "../../../tests/test-companies";

const repo = join(import.meta.dir, "../../..");
const SELF = "services/worker/test/test-runs-at-once.test.ts";
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
// The dev login's workspaces (PACKS in scripts/seed.ts).
const DEV: Record<Pack, string> = {
  real_estate: "seed-real-estate",
  b2b_wholesale: "seed-b2b-wholesale",
};

let other = "";
let devBefore: unknown[] = [];

/** The dev login's workspaces: each row's version (a reseed rewrites it, a delete removes it) and its contacts. */
const devWorkspaces = async () =>
  (
    await admin.query(
      `select slug, xmin::text as version,
              (select count(*)::int from contacts c where c.org_id = o.id) as contacts
         from orgs o where slug = any($1) order by slug`,
      [Object.values(DEV)],
    )
  ).rows;

/** What the other company holds: its row, a contact, an audit and a usage row, and its queued calls, still queued. */
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
  queued: (
    await app.query(
      `select name from pgboss.job where data ->> 'orgId' = $1 and state = 'created' order by name`,
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
  for (const name of QUEUES)
    await app.query(
      `insert into pgboss.job_common (name, data, singleton_key, policy) values ($1, $2::jsonb, $3, 'short')`,
      [
        name,
        JSON.stringify({ orgId: other, runId: randomUUID() }),
        randomUUID(),
      ],
    );
  // On a fresh stack (CI) the dev login's workspaces don't exist yet: seed them, as `bun run db:seed` would, so
  // the check below has something to lose. A workspace that exists is never seeded here.
  for (const [pack, slug] of Object.entries(DEV) as [Pack, string][])
    if (
      !(await admin.query(`select 1 from orgs where slug = $1`, [slug]))
        .rowCount
    )
      await seed(pack);
  devBefore = await devWorkspaces();
}, 60_000);

afterAll(async () => {
  await companies.cleanup();
  await app.end();
  await admin.end();
});

it("four whole-suite runs started at once all pass, and they and a demo run leave others' data alone", async () => {
  // The whole suite as `bun test` finds it, in its own order, but this file, which would start itself again.
  const suite = ["test", `--path-ignore-patterns=${SELF}`];
  const runs = await Promise.all([
    ...[1, 2, 3, 4].map(() => bun(suite)),
    bun(["scripts/demo.ts"]),
  ]);
  // A failed run shows its failures, or the end of its output.
  const failures = (out: string) =>
    out.match(/^\(fail\).*$|^error:.*$/gm)?.join("\n") || out.slice(-3000);
  const files = (out: string) => Number(out.match(/across (\d+) files/)?.[1]);
  // One comparison, so a failure shows everything that went wrong at once.
  expect({
    runs: runs.map((r) => (r.code === 0 ? "" : failures(r.out))),
    wholeSuite: runs.slice(0, 4).map((r) => files(r.out) > 50),
    other: await holdings(),
    dev: await devWorkspaces(),
  }).toEqual({
    runs: ["", "", "", "", ""],
    wholeSuite: [true, true, true, true],
    other: { org: 1, contacts: 1, audit: 1, usage: 1, queued: QUEUES },
    dev: devBefore,
  });
  // Four whole suites at once on CI's two cores: 285 s on 2026-10-04 before the tests-proven item's tests, over 600 s
  // after; the limit grows with the suite, what it proves does not change.
}, 1_200_000);
