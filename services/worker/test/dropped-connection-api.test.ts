// A request whose database connection the database ends while the request waits (a restart, an operator ending a
// session): through the worker's own app, the request answers 500 with nothing internal, the worker keeps running,
// and the next request is served. The request's transaction (withOrg) waits on a row this test's admin connection
// holds locked, and that waiting backend is ended with pg_terminate_backend, so only this test's company is held.
// Real sign-in (a test user made by tests/test-users.ts) and the app_service database path underneath: runs with the
// local stack's settings.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { testCompanies } from "../../../tests/test-companies";
import { testUser } from "../../../tests/test-users";
import app from "../src/index";

const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
const companies = testCompanies(admin);
let token = "";
let orgId = "";

const api = (path: string, init: RequestInit = {}) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
    }),
  );
const putAutonomy = () =>
  api(`/orgs/${orgId}/guardrail-policies`, {
    method: "PUT",
    body: JSON.stringify({
      key: "autonomy",
      config: { book_appointment: "auto" },
    }),
  });

beforeAll(async () => {
  ({ token } = await testUser(admin, "dropped", { operator: true }));
  ({ id: orgId } = await companies.add(
    "Dropped connection",
    async (name, slug) => {
      const made = await api("/orgs", {
        method: "POST",
        body: JSON.stringify({ name, slug, vertical: "real_estate" }),
      });
      const body = (await made.json()) as { id?: string };
      if (made.status !== 201 || !body.id)
        throw new Error(`company not made: ${made.status}`);
      return body.id;
    },
  ));
  expect((await putAutonomy()).status).toBe(200); // the row the next request will wait on
}, 30_000);

afterAll(async () => {
  await companies.cleanup();
  await admin.end();
});

describe("a request whose database connection is ended while it waits", () => {
  it("answers 500 with nothing internal, and the worker goes on serving", async () => {
    const holder = await admin.connect();
    try {
      await holder.query("begin");
      await holder.query(
        "select 1 from guardrail_policies where org_id = $1 and key = 'autonomy' for update",
        [orgId],
      );
      const holderPid = (
        await holder.query<{ pid: number }>("select pg_backend_pid() as pid")
      ).rows[0]?.pid;
      const waiting = putAutonomy();
      // The request's transaction is now waiting on the locked row: end its connection.
      let ended = 0;
      for (let i = 0; i < 100 && !ended; i++) {
        await new Promise((ok) => setTimeout(ok, 50));
        ended = (
          await admin.query(
            "select count(*)::int as n from pg_stat_activity where $1 = any(pg_blocking_pids(pid)) and pg_terminate_backend(pid)",
            [holderPid],
          )
        ).rows[0]?.n;
      }
      expect(ended).toBe(1);
      const res = await waiting;
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "internal" });
    } finally {
      await holder.query("rollback");
      holder.release();
    }
    expect((await putAutonomy()).status).toBe(200);
  }, 30_000);
});
