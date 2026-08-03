// task-59 — criterion 8 / CLAUDE.md non-negotiable: eval_runs carries org_id and is invisible
// cross-tenant. This is the tenancy rail the eval runner writes behind; it proves the RLS on the
// table (migration 007_ops.sql), so unlike the runner specs it is EXPECTED TO PASS on current
// main. Fixtures created as `postgres` (RLS-exempt owner); the client under test is app_service.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createPool, withOrg } from "@revenue-os/db";
import { Pool } from "pg";

const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const APP_SERVICE_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";

const admin = new Pool({ connectionString: LOCAL_DB_URL, max: 2 });
let appService: Pool;
let orgA = "";
let orgB = "";
let runAId = "";

async function seedOrgRun(
  slug: string,
): Promise<{ orgId: string; runId?: string }> {
  const org = await admin.query(
    `insert into orgs (name, slug) values ($1, $1) returning id`,
    [slug],
  );
  const orgId = org.rows[0].id;
  const agent = await admin.query(
    `insert into agents (org_id, key, version, status, model, system_prompt)
     values ($1, 'rls-eval-agent', 1, 'draft', 'claude-sonnet-4-6', 'x') returning id`,
    [orgId],
  );
  const scn = await admin.query(
    `insert into eval_scenarios (org_id, key, persona, script, assertions)
     values ($1, 'rls-eval-scn', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb) returning id`,
    [orgId],
  );
  const run = await admin.query(
    `insert into eval_runs (org_id, scenario_id, agent_id, passed, scores)
     values ($1, $2, $3, true, '{"ok":true}'::jsonb) returning id`,
    [orgId, scn.rows[0].id, agent.rows[0].id],
  );
  return { orgId, runId: run.rows[0].id };
}

beforeAll(async () => {
  await cleanup();
  const a = await seedOrgRun("eval-rls-a");
  const b = await seedOrgRun("eval-rls-b");
  orgA = a.orgId;
  orgB = b.orgId;
  runAId = a.runId ?? "";
  appService = createPool(APP_SERVICE_URL);
});

async function cleanup() {
  const sub = `select id from orgs where slug in ('eval-rls-a','eval-rls-b')`;
  await admin.query(`delete from eval_runs where org_id in (${sub})`);
  await admin.query(
    `delete from orgs where slug in ('eval-rls-a','eval-rls-b')`,
  );
}

afterAll(async () => {
  await cleanup();
  await appService?.end();
  await admin.end();
});

describe("eval_runs tenant isolation (criterion 8)", () => {
  it("withOrg(A) sees org A's eval_runs", async () => {
    const rows = await withOrg(appService, orgA, (tx) =>
      tx.query(`select id from eval_runs`).then((r) => r.rows),
    );
    expect(rows.map((r) => r.id)).toContain(runAId);
  });

  it("withOrg(B) cannot read org A's eval_runs even when asked explicitly", async () => {
    const rows = await withOrg(appService, orgB, (tx) =>
      tx
        .query(`select id from eval_runs where org_id = $1`, [orgA])
        .then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it("withOrg(B) cannot insert an eval_runs row into org A (RLS with-check)", async () => {
    const scn = await admin.query(
      `select id from eval_scenarios where org_id = $1 limit 1`,
      [orgA],
    );
    const agent = await admin.query(
      `select id from agents where org_id = $1 limit 1`,
      [orgA],
    );
    expect(
      withOrg(appService, orgB, (tx) =>
        tx.query(
          `insert into eval_runs (org_id, scenario_id, agent_id, passed)
           values ($1, $2, $3, true)`,
          [orgA, scn.rows[0].id, agent.rows[0].id],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
