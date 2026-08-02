// H10 (hole audit, Package 2 / task-58) — RED spec: the scheduled tick must actually DISCOVER the
// orgs that have due runs. REAL-DB INTEGRATION, CI-OWNED (ci.yml supabase-local-stack): the defect
// IS an RLS/role property, so it cannot be observed without the real local stack and the real
// app_service role. Setup mirrors scheduler.test.ts.
//
// DEFECT (ground truth, read directly, main@4a3b3fe):
//   • services/worker/src/jobs.ts:204-223 (`runScheduledTick`, the pg-boss cron target registered
//     at :167-170) discovers orgs with
//       select distinct org_id from workflow_runs where status in ('pending','waiting') and wake_at <= now()
//     on `pool` — the RLS-BOUND app_service pool (services/worker/src/db.ts:5), with no
//     request.org_id set. workflow_runs' select policy is
//     `org_id = app.current_org_id() and app.is_member(org_id,'viewer')`
//     (supabase/migrations/006_harness.sql:199-200), so the scan returns ZERO rows and the
//     per-org fan-out at :216 iterates an empty list — forever.
//   • Its own docblock admits it ("in production the fan-out is EMPTY until an RLS-exempt org
//     enumerator lands"), and the catch at :213 turns the failure into a log line, so the tick
//     reports healthy while scheduling nothing.
//   • Measured on the local stack before writing this suite: with one org holding a due run,
//     app_service sees 0 orgs, the superuser sees 1.
//   • Nothing catches it: services/worker/test/scheduler.test.ts always calls tick(pool, orgId)
//     with a test-supplied org id, and services/worker/test/wiring-jobs.test.ts asserts only that
//     a pgboss.schedule row exists — the discovery step has never been executed in a test.
//
// PINNED here:
//   1. the production discovery seam EXISTS and, executed the production way (the RLS-bound
//      app_service pool, no org scope), returns EVERY org that has a due run — at least two,
//      cross-tenant, which is the whole point of a fan-out;
//   2. it discriminates on dueness: an org whose only run wakes in the future is not returned;
//   3. it returns org IDS only — never another tenant's row data;
//   4. cross-tenant denial: the fix must NOT be "let app_service read everything". After it,
//      an org-scoped withOrg(orgA) read still cannot see org B's workflow_runs, and an unscoped
//      app_service read of contacts still returns nothing.
//
// NOT PINNED (deliberately): the MECHANISM — SECURITY DEFINER function, a dedicated enumerator
//   role, a narrowed policy, or a persisted due-org index are all acceptable; this suite only
//   calls the seam and reads the answer. NOTE FOR REVIEW: a SECURITY DEFINER enumerator would
//   need a NEW MIGRATION (append-only, expand-contract) — the tester did not write one, and the
//   choice is a Fable review point.
//   The one thing a test cannot avoid naming is the seam itself: this suite looks for a function
//   export called `discoverDueOrgs` on services/worker/src/scheduler.ts or services/worker/src/jobs.ts
//   (either home is fine; jobs.ts is only importable with the CI env set, so the probe tolerates
//   an unimportable module). A different name/home is a one-line change here, under review.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createPool, withOrg } from "@revenue-os/db";
import pg from "pg";

const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 4,
});
// app_service — the RLS-bound role production runs as. Discovery must work AS THIS ROLE.
const appPool = createPool(
  process.env.DATABASE_URL ||
    "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres",
);

/** The production org-discovery seam: "which orgs have runs due right now?" */
type DiscoverDueOrgs = (pool: pg.Pool) => Promise<string[]>;
const CONTRACT_NAME = "discoverDueOrgs";
const CANDIDATE_MODULES = ["../src/scheduler", "../src/jobs"];

async function loadDiscovery(): Promise<{
  fn: DiscoverDueOrgs | null;
  tried: string[];
}> {
  const tried: string[] = [];
  for (const spec of CANDIDATE_MODULES) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(spec)) as unknown as Record<string, unknown>;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message.split("\n")[0] : String(err);
      tried.push(`${spec}: not importable (${msg})`);
      continue;
    }
    const candidate = mod[CONTRACT_NAME];
    if (typeof candidate === "function") {
      return { fn: candidate as DiscoverDueOrgs, tried };
    }
    tried.push(`${spec}: no exported ${CONTRACT_NAME}`);
  }
  return { fn: null, tried };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let orgA = "";
let orgB = "";
let orgC = ""; // has a run, but it is NOT due
let runA = "";
let runB = "";

async function cleanup(): Promise<void> {
  await admin.query(`delete from orgs where slug like 'org-discovery-test-%'`);
}

/** One org with one workflow_run, due (wake_at = now) or not (wake_at far in the future). */
async function seedOrgWithRun(
  label: string,
  due: boolean,
): Promise<{ orgId: string; runId: string }> {
  const org = (
    await admin.query(
      `insert into orgs (name, slug) values ($1, $2) returning id`,
      [`Discovery ${label}`, `org-discovery-test-${label}-${Date.now()}`],
    )
  ).rows[0].id as string;
  const contact = (
    await admin.query(
      `insert into contacts (org_id, first_name) values ($1, $2) returning id`,
      [org, label],
    )
  ).rows[0].id as string;
  const wf = (
    await admin.query(
      `insert into workflows (org_id, key, version, status, definition)
       values ($1, $2, 1, 'active', $3::jsonb) returning id`,
      [
        org,
        `discovery-wf-${label}-${Date.now()}`,
        JSON.stringify({
          entry: "c",
          steps: {
            c: { kind: "call", agent: "closer", on: { completed: "end" } },
            end: { kind: "end" },
          },
        }),
      ],
    )
  ).rows[0].id as string;
  // Dueness is evaluated against the DATABASE clock, so express it in SQL: an hour in the past
  // (unambiguously due) or the year 2099 (unambiguously not).
  const run = (
    await admin.query(
      `insert into workflow_runs
         (org_id, workflow_id, contact_id, status, current_step, state, wake_at)
       values ($1, $2, $3, 'waiting', 'c', $4::jsonb,
               case when $5 then now() - interval '1 hour'
                    else timestamptz '2099-01-01T00:00:00Z' end)
       returning id`,
      [org, wf, contact, JSON.stringify({ contactId: contact }), due],
    )
  ).rows[0].id as string;
  return { orgId: org, runId: run };
}

beforeAll(async () => {
  await cleanup();
  const a = await seedOrgWithRun("a", true);
  const b = await seedOrgWithRun("b", true);
  const c = await seedOrgWithRun("c", false);
  orgA = a.orgId;
  runA = a.runId;
  orgB = b.orgId;
  runB = b.runId;
  orgC = c.orgId;
}, 30_000);

afterAll(async () => {
  await cleanup();
  await appPool.end();
  await admin.end();
});

describe("scheduled-tick org discovery (H10)", () => {
  it("the production discovery seam returns every org with a due run (cross-tenant fan-out)", async () => {
    const { fn, tried } = await loadDiscovery();
    // The seam must exist: without it the cron tick fans out over an empty list forever.
    expect({ seam: fn ? "found" : "missing", tried }).toMatchObject({
      seam: "found",
    });

    const discovered = await (fn as DiscoverDueOrgs)(appPool);

    expect(Array.isArray(discovered)).toBe(true);
    expect(discovered).toContain(orgA);
    expect(discovered).toContain(orgB); // ≥ 2 tenants — a single-tenant answer is the bug
    for (const id of discovered) {
      expect(String(id)).toMatch(UUID); // ids only: never another tenant's row data
    }
  }, 30_000);

  it("discovery discriminates on DUENESS: an org whose run wakes in 2099 is not returned", async () => {
    const { fn, tried } = await loadDiscovery();
    expect({ seam: fn ? "found" : "missing", tried }).toMatchObject({
      seam: "found",
    });
    const discovered = await (fn as DiscoverDueOrgs)(appPool);
    expect(discovered).not.toContain(orgC);
  }, 30_000);

  it("cross-tenant denial: discovery does not become a blanket RLS bypass for app_service", async () => {
    // The fix must scope the exemption to "which orgs are due", not to tenant data. Org-scoped
    // reads stay org-scoped, and an unscoped app_service read still sees nothing.
    const ownRun = await withOrg(appPool, orgA, async (tx) => {
      const r = await tx.query(`select id from workflow_runs where id = $1`, [
        runA,
      ]);
      return r.rowCount ?? 0;
    });
    expect(ownRun).toBe(1); // non-vacuous: org A really can see its OWN run

    const foreignRun = await withOrg(appPool, orgA, async (tx) => {
      const r = await tx.query(`select id from workflow_runs where id = $1`, [
        runB,
      ]);
      return r.rowCount ?? 0;
    });
    expect(foreignRun).toBe(0); // …and never org B's

    const unscopedContacts = await appPool.query(
      `select id from contacts where org_id in ($1, $2)`,
      [orgA, orgB],
    );
    expect(unscopedContacts.rowCount ?? 0).toBe(0); // no org scope ⇒ no tenant rows, still
  }, 30_000);
});
