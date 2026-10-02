// The shared test-company helper (tests/test-companies.ts): each company under a random name, and a clean-up that
// deletes only what it made, with the rows that never cascade, and never the dev login's workspace.
import { afterAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { testCompanies } from "./test-companies";

const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});
// The other company each test must leave alone, made and removed by a helper of its own.
const others = testCompanies(admin);

afterAll(async () => {
  await others.cleanup();
  await admin.end();
});

/** A contact plus a row in each table that does not cascade from its company: audit log, usage, eval runs. */
async function fill(orgId: string) {
  await admin.query(
    `insert into contacts (org_id, first_name) values ($1, 'Isolation')`,
    [orgId],
  );
  await admin.query(
    `insert into audit_log (org_id, actor_type, action) values ($1, 'system', 'test.isolation')`,
    [orgId],
  );
  await admin.query(
    `insert into usage_events (org_id, kind, provider, quantity, unit, cost_usd)
     values ($1, 'llm', 'fake', 1, 'tokens', 0)`,
    [orgId],
  );
  await admin.query(
    `with scenario as (
       insert into eval_scenarios (org_id, key, persona, script, assertions)
       values ($1, 'isolation', '{}', '{}', '{}') returning id
     ), agent as (
       insert into agents (org_id, key, version, status, model, system_prompt)
       values ($1, 'isolation', 1, 'draft', 'fake', 'fake') returning id
     )
     insert into eval_runs (org_id, scenario_id, agent_id, passed)
     select $1, scenario.id, agent.id, true from scenario, agent`,
    [orgId],
  );
}

/** How many rows `orgId` has: its company row, then contacts, audit log, usage and eval runs. */
const rows = async (orgId: string) =>
  (
    await admin.query(
      `select (select count(*)::int from orgs where id = $1) org,
              (select count(*)::int from contacts where org_id = $1) contacts,
              (select count(*)::int from audit_log where org_id = $1) audit,
              (select count(*)::int from usage_events where org_id = $1) usage,
              (select count(*)::int from eval_runs where org_id = $1) evals`,
      [orgId],
    )
  ).rows[0];
const FULL = { org: 1, contacts: 1, audit: 1, usage: 1, evals: 1 };
const GONE = { org: 0, contacts: 0, audit: 0, usage: 0, evals: 0 };

describe("testCompanies", () => {
  it("makes each company under a random name and slug, never the same twice", async () => {
    const mine = testCompanies(admin);
    const a = await mine.add("Isolation");
    const b = await mine.add("Isolation");
    const made = (
      await admin.query(
        `select id, name, slug from orgs where id = any($1::uuid[]) order by name`,
        [[a.id, b.id]],
      )
    ).rows;
    expect(made).toHaveLength(2);
    expect(a.slug).not.toBe(b.slug);
    expect(made[0].name).not.toBe(made[1].name);
    for (const row of made) {
      expect(row.name).toStartWith("Isolation ");
      expect(row.slug).toStartWith("test-");
    }
    await mine.cleanup();
  });

  it("clean-up deletes what it made, the rows that never cascade included, and leaves another company alone", async () => {
    const mine = testCompanies(admin);
    const { id } = await mine.add();
    const other = await others.add();
    await fill(id);
    await fill(other.id);

    await mine.cleanup();

    expect(await rows(id)).toEqual(GONE);
    expect(await rows(other.id)).toEqual(FULL);
  });

  it("clean-up never deletes the dev login's workspace", async () => {
    const dev = async () =>
      (
        await admin.query(
          `select id from orgs where slug in ('seed-real-estate', 'seed-b2b-wholesale') order by id`,
        )
      ).rows;
    const before = await dev();
    const mine = testCompanies(admin);
    await mine.add();
    await mine.cleanup();
    expect(await dev()).toEqual(before);
  });

  it("cleans up a company made through another path, such as the product's own route", async () => {
    const mine = testCompanies(admin);
    const { id, slug } = await mine.add("Routed", async (name, slug) => {
      const r = await admin.query(
        `insert into orgs (name, slug, vertical) values ($1, $2, 'real_estate') returning id`,
        [name, slug],
      );
      return r.rows[0].id;
    });
    expect(slug).toStartWith("test-");
    expect((await rows(id)).org).toBe(1);
    await mine.cleanup();
    expect((await rows(id)).org).toBe(0);
  });

  it("refuses to take on a company it did not make, so clean-up can't reach it", async () => {
    const other = await others.add();
    const mine = testCompanies(admin);
    await expect(mine.add("Borrowed", async () => other.id)).rejects.toThrow(
      /not made/,
    );
    await mine.cleanup();
    expect((await rows(other.id)).org).toBe(1);
  });
});
