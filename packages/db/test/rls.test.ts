// One company can't read another's rows: the backend role's row-level security, proved with a cross-company read.
// Fixtures are created as `postgres` (table owner, RLS-exempt); the client under test
// connects as `app_service` — the RLS-bound backend role (docs/db-design.md, section 1).
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Pool } from "pg";
import { testCompanies } from "../../../tests/test-companies";
import { createPool, withOrg } from "../src";

// `||` not `??`: bun auto-loads .env where these can be declared-but-empty strings
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const APP_SERVICE_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";

const admin = new Pool({ connectionString: LOCAL_DB_URL, max: 2 });
const companies = testCompanies(admin);
let appService: Pool;
let orgA = "";
let orgB = "";

beforeAll(async () => {
  // app_service's login is turned on by tests/setup.local.ts (bun test preload) when a stack lacks it
  orgA = (await companies.add("RLS Test Org A")).id;
  orgB = (await companies.add("RLS Test Org B")).id;
  await admin.query(
    `insert into contacts (org_id, first_name) values ($1, 'Alice-A'), ($2, 'Bob-B')`,
    [orgA, orgB],
  );
  appService = createPool(APP_SERVICE_URL);
});

afterAll(async () => {
  await companies.cleanup();
  await appService?.end();
  await admin.end();
});

describe("app_service client tenant isolation", () => {
  it("withOrg(A) sees only org A's contacts", async () => {
    const rows = await withOrg(appService, orgA, async (tx) => {
      const r = await tx.query(`select first_name, org_id from contacts`);
      return r.rows;
    });
    expect(rows.length).toBe(1);
    expect(rows[0].first_name).toBe("Alice-A");
    expect(rows[0].org_id).toBe(orgA);
  });

  it("withOrg(A) cannot read org B rows even when asked explicitly", async () => {
    const rows = await withOrg(appService, orgA, async (tx) => {
      const r = await tx.query(`select * from contacts where org_id = $1`, [
        orgB,
      ]);
      return r.rows;
    });
    expect(rows.length).toBe(0);
  });

  it("withOrg(A) cannot insert a contact into org B (RLS with-check)", async () => {
    expect(
      withOrg(appService, orgA, async (tx) => {
        await tx.query(
          `insert into contacts (org_id, first_name) values ($1, 'Mallory')`,
          [orgB],
        );
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it("a connection with no org context sees nothing", async () => {
    const client = await appService.connect();
    try {
      const r = await client.query(`select count(*)::int as n from contacts`);
      expect(r.rows[0].n).toBe(0);
    } finally {
      client.release();
    }
  });

  it("withOrg rejects a non-uuid org id at the boundary (Zod, T11)", async () => {
    expect(withOrg(appService, "not-a-uuid", async () => {})).rejects.toThrow();
  });

  it("org context does not leak across withOrg calls on the same pool", async () => {
    await withOrg(appService, orgA, async (tx) => {
      await tx.query(`select 1`);
    });
    const rowsB = await withOrg(appService, orgB, async (tx) => {
      const r = await tx.query(`select first_name from contacts`);
      return r.rows;
    });
    expect(rowsB.length).toBe(1);
    expect(rowsB[0].first_name).toBe("Bob-B");
  });
});
