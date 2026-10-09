// A request body that is missing or is not JSON is bad input, like a body the route's schema refuses: each worker
// route that reads a JSON body answers it 400 {"error":"invalid_request"} and writes nothing. Repro (2026-10-06, the
// real worker signed in as the dev login, body "{oops"): PATCH /orgs/:orgId, PUT /orgs/:orgId/guardrail-policies and
// POST /orgs/:orgId/members each answered 500 {"error":"internal"} and logged an "unhandled route error".
// POST /orgs has the same check in orgs.test.ts; the call-event webhook reads its own body (vapi-webhook.test.ts).
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
const companies = testCompanies(admin);

let owner: TestUser;
let orgId = "";

const send = (method: string, path: string, body?: string) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      body,
      headers: {
        authorization: `Bearer ${owner.token}`,
        "content-type": "application/json",
      },
    }),
  );

/** Everything these routes write for the company: the company row, its members, guardrail settings and audit trail. */
const written = async () =>
  (
    await admin.query(
      `select (select to_jsonb(o) from orgs o where o.id = $1) as org,
              (select jsonb_agg(m order by m.user_id) from org_members m where m.org_id = $1) as members,
              (select jsonb_agg(g order by g.key) from guardrail_policies g where g.org_id = $1) as policies,
              (select count(*) from audit_log a where a.org_id = $1) as audits`,
      [orgId],
    )
  ).rows[0];

beforeAll(async () => {
  owner = await testUser(admin, "bad-body", { operator: true });
  // Made through POST /orgs, so the owner is the company's admin and passes every route's role check.
  ({ id: orgId } = await companies.add("Bad body", async (name, slug) => {
    const res = await send("POST", "/orgs", JSON.stringify({ name, slug }));
    return ((await res.json()) as { id: string }).id;
  }));
});

afterAll(async () => {
  await companies.cleanup();
  await admin.end();
});

describe("a missing or non-JSON body is refused with 400 invalid_request, and nothing is written", () => {
  for (const [method, route] of [
    ["PATCH", "/orgs/:orgId"],
    ["POST", "/orgs/:orgId/members"],
    ["PUT", "/orgs/:orgId/guardrail-policies"],
  ] as const)
    it(`${method} ${route}, as the company's admin`, async () => {
      const before = await written();
      const replies = [];
      for (const body of [undefined, "{oops"]) {
        const res = await send(method, route.replace(":orgId", orgId), body);
        replies.push({ body, status: res.status, reply: await res.json() });
      }
      expect(replies).toEqual(
        [undefined, "{oops"].map((body) => ({
          body,
          status: 400,
          reply: { error: "invalid_request" },
        })),
      );
      expect(await written()).toEqual(before);
    });
});
