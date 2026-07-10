// Task 12 (audit-db-schema F1): the merge-update inside importContacts must be org-scoped
// in its OWN where clause (docs/patterns/drizzle-query.md — "org_id in EVERY where; RLS is
// the net, not the query plan"). The poisoned-identity fixture below is representable because
// contact_identities.contact_id carries no org-match constraint to contacts: defense-in-depth
// means the query refuses the cross-org write even if the RLS net were ever misconfigured.
// Fixtures as `postgres` (RLS-exempt); code under test runs as `app_service` via withOrg.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Pool } from "pg";
import { createPool, importContacts } from "../src";

const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const APP_SERVICE_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";

const admin = new Pool({ connectionString: LOCAL_DB_URL, max: 2 });
let appService: Pool;
let orgC = "";
let orgD = "";
let victimId = "";
const POISON_PHONE = "+15550120001";
const HAPPY_PHONE = "+15550120002";
const ACTOR = "00000000-0000-0000-0000-000000000012";

beforeAll(async () => {
  const res = await admin.query(
    `insert into orgs (name, slug) values
		   ('Merge Scope Org C', 'merge-scope-c'), ('Merge Scope Org D', 'merge-scope-d')
		 returning id, slug`,
  );
  orgC = res.rows.find((r) => r.slug === "merge-scope-c").id;
  orgD = res.rows.find((r) => r.slug === "merge-scope-d").id;

  // Victim contact lives in org D…
  const victim = await admin.query(
    `insert into contacts (org_id, first_name, attributes) values ($1, 'Victim-D', '{}')
		 returning id`,
    [orgD],
  );
  victimId = victim.rows[0].id;
  // …but a poisoned identity row in org C points at it (schema permits: no org-match FK).
  await admin.query(
    `insert into contact_identities (org_id, contact_id, kind, value, is_primary)
		 values ($1, $2, 'phone', $3, true)`,
    [orgC, victimId, POISON_PHONE],
  );

  appService = createPool(APP_SERVICE_URL);
});

afterAll(async () => {
  // audit_log.org_id has no cascade (append-only forever) — clear it before the orgs
  await admin.query(
    `delete from audit_log where org_id in
		   (select id from orgs where slug in ('merge-scope-c','merge-scope-d'))`,
  );
  await admin.query(
    `delete from orgs where slug in ('merge-scope-c','merge-scope-d')`,
  );
  await appService?.end();
  await admin.end();
});

describe("importContacts merge-update org scoping", () => {
  it("never mutates another org's contact via a poisoned cross-org identity", async () => {
    await importContacts(
      appService,
      orgC,
      [
        {
          first_name: "Evil",
          last_name: "Merge",
          phone: POISON_PHONE,
          note: "pwn",
        },
      ],
      ACTOR,
    );
    const after = await admin.query(
      `select first_name, last_name, attributes from contacts where id = $1`,
      [victimId],
    );
    expect(after.rows[0].first_name).toBe("Victim-D");
    expect(after.rows[0].last_name).toBeNull();
    expect(after.rows[0].attributes).toEqual({});
  });

  it("still merges within the org (happy path intact)", async () => {
    const first = await importContacts(
      appService,
      orgC,
      [{ first_name: "Carla", phone: HAPPY_PHONE }],
      ACTOR,
    );
    expect(first.created).toBe(1);

    const second = await importContacts(
      appService,
      orgC,
      [
        {
          first_name: "",
          last_name: "Chandra",
          phone: HAPPY_PHONE,
          city: "Pune",
        },
      ],
      ACTOR,
    );
    expect(second.merged).toBe(1);
    expect(second.created).toBe(0);

    const row = await admin.query(
      `select c.first_name, c.last_name, c.attributes from contacts c
			 join contact_identities ci on ci.contact_id = c.id
			 where ci.org_id = $1 and ci.value = $2`,
      [orgC, HAPPY_PHONE],
    );
    expect(row.rows[0].first_name).toBe("Carla"); // coalesce keeps existing
    expect(row.rows[0].last_name).toBe("Chandra"); // fills missing
    expect(row.rows[0].attributes).toEqual({ city: "Pune" });
  });
});
