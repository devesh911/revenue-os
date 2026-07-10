// Task 9 acceptance (project-spec §12): upload → identities → dedupe on (org, phone);
// duplicate rows MERGE into the existing contact instead of creating a new one.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
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

let token = "";
let orgId = "";

beforeAll(async () => {
  const email = `csv-${Date.now()}@example.com`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password: "test-password-123!" }),
  });
  token = ((await res.json()) as { access_token: string }).access_token;
  const org = await app.fetch(
    new Request("http://localhost/orgs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: "CSV Org",
        slug: `csv-${Date.now()}`,
        vertical: "b2b_wholesale",
      }),
    }),
  );
  orgId = ((await org.json()) as { id: string }).id;
});

afterAll(async () => {
  await admin.end();
});

function importCsv(body: string) {
  return app.fetch(
    new Request(`http://localhost/orgs/${orgId}/contacts/import`, {
      method: "POST",
      headers: { "content-type": "text/csv", authorization: `Bearer ${token}` },
      body,
    }),
  );
}

describe("contact CSV import (ceramic path)", () => {
  it("imports rows: contacts + E.164 identities + attributes from extra columns", async () => {
    const res = await importCsv(
      "first_name,last_name,phone,city,business_type\n" +
        "Ravi,Shah,098765 43210,Morbi,retailer\n" +
        "Priya,Mehta,+91-98765-43211,Ahmedabad,architect\n",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      created: number;
      merged: number;
      invalid: number;
    };
    expect(body).toEqual({ created: 2, merged: 0, invalid: 0 });

    const ids = await admin.query(
      `select value from contact_identities where org_id = $1 and kind = 'phone' order by value`,
      [orgId],
    );
    expect(ids.rows.map((r) => r.value)).toEqual([
      "+919876543210",
      "+919876543211",
    ]);

    const attrs = await admin.query(
      `select attributes ->> 'city' as city, attributes ->> 'business_type' as bt, source
			 from contacts c join contact_identities i on i.contact_id = c.id
			 where c.org_id = $1 and i.value = '+919876543210'`,
      [orgId],
    );
    expect(attrs.rows[0].city).toBe("Morbi");
    expect(attrs.rows[0].bt).toBe("retailer");
    expect(attrs.rows[0].source).toBe("csv_import");
  });

  it("duplicate rows merge — same phone in a new format does NOT create a second contact", async () => {
    const res = await importCsv(
      "first_name,phone,monthly_volume\nRavi,9876543210,500\nNew,9876543299,10\n",
    );
    const body = (await res.json()) as {
      created: number;
      merged: number;
      invalid: number;
    };
    expect(body).toEqual({ created: 1, merged: 1, invalid: 0 });

    const count = await admin.query(
      `select count(*)::int n from contact_identities where org_id = $1 and value = '+919876543210'`,
      [orgId],
    );
    expect(count.rows[0].n).toBe(1); // dedupe guarantee: unique (org, kind, value)

    const merged = await admin.query(
      `select attributes ->> 'monthly_volume' as mv from contacts c
			 join contact_identities i on i.contact_id = c.id
			 where c.org_id = $1 and i.value = '+919876543210'`,
      [orgId],
    );
    expect(merged.rows[0].mv).toBe("500"); // merge enriches attributes on the existing contact
  });

  it("unparseable phones are reported, not silently dropped", async () => {
    const res = await importCsv("first_name,phone\nGhost,not-a-phone\n");
    const body = (await res.json()) as {
      created: number;
      merged: number;
      invalid: number;
    };
    expect(body).toEqual({ created: 0, merged: 0, invalid: 1 });
  });

  it("rejects a CSV with no phone column before any writes (S5.1)", async () => {
    const res = await importCsv("first_name,city\nNobody,Nowhere\n");
    expect(res.status).toBe(400);
  });

  it("the import is audited with counts", async () => {
    const r = await admin.query(
      `select count(*)::int n from audit_log where org_id = $1 and action = 'contacts.import'`,
      [orgId],
    );
    expect(r.rows[0].n).toBeGreaterThanOrEqual(2);
  });
});
