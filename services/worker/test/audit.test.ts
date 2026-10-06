// audit() used by a sample mutation — before/after captured.
// audit_log doubles as the agent action trace; rows are append-only by RLS.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { testCompanies } from "../../../tests/test-companies";
import { type TestUser, testUser } from "../../../tests/test-users";
import app from "../src/index";

const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 1,
});

function api(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("authorization", `Bearer ${token}`);
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
  );
}

const companies = testCompanies(admin);
let user: TestUser;
let orgId = "";
let orgName = "";

beforeAll(async () => {
  user = await testUser(admin, "audit", { operator: true });
  // Made through the product's own POST /orgs: org.create is the audited mutation under test.
  ({ id: orgId } = await companies.add("Audit Org", async (name, slug) => {
    orgName = name;
    const res = await api("/orgs", user.token, {
      method: "POST",
      body: JSON.stringify({ name, slug }),
    });
    return ((await res.json()) as { id: string }).id;
  }));
});

afterAll(async () => {
  await companies.cleanup();
  await admin.end();
});

describe("audit spine", () => {
  it("org.create emitted an audit row attributing the actor", async () => {
    const r = await admin.query(
      `select actor_type, actor_id, resource_type, after from audit_log
			 where org_id = $1 and action = 'org.create'`,
      [orgId],
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].actor_type).toBe("user");
    expect(r.rows[0].actor_id).toBe(user.userId);
    expect(r.rows[0].after.name).toBe(orgName);
  });

  it("org.update captures before AND after", async () => {
    const res = await api(`/orgs/${orgId}`, user.token, {
      method: "PATCH",
      body: JSON.stringify({ name: "Audit Org Renamed" }),
    });
    expect(res.status).toBe(200);

    const r = await admin.query(
      `select before, after, actor_id from audit_log
			 where org_id = $1 and action = 'org.update'`,
      [orgId],
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].before.name).toBe(orgName);
    expect(r.rows[0].after.name).toBe("Audit Org Renamed");
    expect(r.rows[0].actor_id).toBe(user.userId);
  });

  it("audit rows are immutable by RLS (append-only — no update policy exists)", async () => {
    const appService = new pg.Pool({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres",
      max: 1,
    });
    const client = await appService.connect();
    try {
      await client.query("begin");
      await client.query(`select set_config('request.org_id', $1, true)`, [
        orgId,
      ]);
      const upd = await client.query(
        `update audit_log set action = 'tampered' where org_id = $1 returning id`,
        [orgId],
      );
      expect(upd.rowCount).toBe(0); // no update policy → zero rows affected
      await client.query("rollback");
    } finally {
      client.release();
      await appService.end();
    }
  });
});
