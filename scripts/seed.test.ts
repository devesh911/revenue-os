// Task 5 acceptance (project-spec §12): after `db:seed <pack>`, dispositions / pipelines /
// guardrails / agent v1 / workflow v1 / field definitions / eval personas exist — idempotently.
import { afterAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { seed } from "./seed";

const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});

afterAll(async () => {
  await admin.query(
    `delete from orgs where slug in ('seed-real-estate','seed-b2b-wholesale')`,
  );
  await admin.end();
});

async function counts(orgId: string) {
  const q = async (sql: string) =>
    Number((await admin.query(sql, [orgId])).rows[0].n);
  return {
    dispositions: await q(
      `select count(*)::int n from dispositions where org_id = $1`,
    ),
    pipelines: await q(
      `select count(*)::int n from pipelines where org_id = $1`,
    ),
    stages: await q(
      `select count(*)::int n from pipeline_stages where org_id = $1`,
    ),
    fields: await q(
      `select count(*)::int n from field_definitions where org_id = $1`,
    ),
    guardrails: await q(
      `select count(*)::int n from guardrail_policies where org_id = $1`,
    ),
    agents: await q(
      `select count(*)::int n from agents where org_id = $1 and version = 1`,
    ),
    workflows: await q(
      `select count(*)::int n from workflows where org_id = $1 and version = 1`,
    ),
    personas: await q(
      `select count(*)::int n from eval_scenarios where org_id = $1`,
    ),
  };
}

describe("seed packs (db-design §9)", () => {
  it("real_estate pack populates the vertical template", async () => {
    const { orgId } = await seed("real_estate");
    const c = await counts(orgId);
    expect(c.dispositions).toBe(7);
    expect(c.pipelines).toBe(1);
    expect(c.stages).toBe(6);
    expect(c.fields).toBe(5);
    expect(c.guardrails).toBe(4);
    expect(c.agents).toBe(1);
    expect(c.workflows).toBe(1);
    expect(c.personas).toBe(10);
  });

  it("b2b_wholesale pack populates the vertical template", async () => {
    const { orgId } = await seed("b2b_wholesale");
    const c = await counts(orgId);
    expect(c.dispositions).toBe(7);
    expect(c.pipelines).toBe(1);
    expect(c.stages).toBe(6);
    expect(c.fields).toBe(4);
    expect(c.guardrails).toBe(4);
    expect(c.agents).toBe(1);
    expect(c.workflows).toBe(1);
    expect(c.personas).toBe(10);
  });

  it("re-seeding is idempotent (no duplicate template rows)", async () => {
    const first = await seed("real_estate");
    const second = await seed("real_estate");
    expect(second.orgId).toBe(first.orgId);
    const c = await counts(second.orgId);
    expect(c.dispositions).toBe(7);
    expect(c.personas).toBe(10);
  });

  it("seeded agent v1 and workflow v1 are drafts (eval gate before activation — moat inv. 5)", async () => {
    const { orgId } = await seed("real_estate");
    const r = await admin.query(
      `select (select status from agents where org_id = $1 and version = 1) as agent,
			        (select status from workflows where org_id = $1 and version = 1) as workflow`,
      [orgId],
    );
    expect(r.rows[0].agent).toBe("draft");
    expect(r.rows[0].workflow).toBe("draft");
  });

  it("rejects unknown packs", async () => {
    expect(seed("not_a_pack" as never)).rejects.toThrow(/unknown pack/i);
  });
});
