// Task 6 acceptance (project-spec §12): audit() used by a sample mutation — before/after captured.
// audit_log doubles as the agent action trace (Layer A); rows are append-only by RLS.
import { beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import app from "../src/index";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 1,
});

async function signup(tag: string) {
  const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password: "test-password-123!" }),
  });
  const body = (await res.json()) as {
    access_token: string;
    user: { id: string };
  };
  return { token: body.access_token, userId: body.user.id };
}

function api(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("authorization", `Bearer ${token}`);
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
  );
}

let user: { token: string; userId: string };
let orgId = "";

beforeAll(async () => {
  user = await signup("audit");
  const res = await api("/orgs", user.token, {
    method: "POST",
    body: JSON.stringify({ name: "Audit Org", slug: `audit-${Date.now()}` }),
  });
  orgId = ((await res.json()) as { id: string }).id;
});

describe("audit spine (task 6)", () => {
  it("org.create emitted an audit row attributing the actor", async () => {
    const r = await admin.query(
      `select actor_type, actor_id, resource_type, after from audit_log
			 where org_id = $1 and action = 'org.create'`,
      [orgId],
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].actor_type).toBe("user");
    expect(r.rows[0].actor_id).toBe(user.userId);
    expect(r.rows[0].after.name).toBe("Audit Org");
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
    expect(r.rows[0].before.name).toBe("Audit Org");
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
