// Two tenants stay isolated (the cross-tenant denial test AGENTS.md requires) — exercised at the
// API surface: real local sign-in users, jose-verified JWTs, app_service DB path underneath. Only our operator
// list may create a company (supabase/migrations/018_platform_operators.sql): user A is on it, user B is not.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { testCompanies } from "../../../tests/test-companies";
import { type TestUser, testUser } from "../../../tests/test-users";
import app from "../src/index";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 1,
});
const companies = testCompanies(admin);

function api(path: string, token: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
  );
}

let userA: TestUser;
let userB: TestUser;
let orgA = "";
let orgAName = "";
let orgASlug = "";

/** User A makes a company through POST /orgs, the route under test: its id and name, and the reply. */
async function createAsA(label: string) {
  let made = { name: "", slug: "", status: 0, role: "" };
  const { id } = await companies.add(label, async (name, slug) => {
    const res = await api("/orgs", userA.token, {
      method: "POST",
      body: JSON.stringify({ name, slug }),
    });
    const body = (await res.json()) as { id: string; role: string };
    made = { name, slug, status: res.status, role: body.role };
    return body.id;
  });
  return { id, ...made };
}

/** User B, who is not on our operator list, tries to make a company with `body`: the reply, and whether one was made. */
async function strangerCreates(body: (name: string, slug: string) => string) {
  let reply = { status: 0, body: {} as unknown };
  const made = companies.add("Stranger's company", async (name, slug) => {
    const res = await api("/orgs", userB.token, {
      method: "POST",
      body: body(name, slug),
    });
    reply = { status: res.status, body: await res.json() };
    return (reply.body as { id?: string }).id ?? "";
  });
  const refused = await made.then(
    () => false,
    (err: Error) => /not made/.test(err.message),
  );
  return { ...reply, refused };
}

beforeAll(async () => {
  userA = await testUser(admin, "tenant-a", { operator: true });
  userB = await testUser(admin, "tenant-b");
});

afterAll(async () => {
  await companies.cleanup();
  await admin.end();
});

describe("auth gate — JWT verification (docs/security.md S1.5)", () => {
  it("rejects requests with no token", async () => {
    const res = await api("/orgs", null);
    expect(res.status).toBe(401);
  });

  it("rejects a garbage token", async () => {
    const res = await api("/orgs", "not.a.jwt");
    expect(res.status).toBe(401);
  });
});

describe("org bootstrap + tenant isolation", () => {
  it("user A creates an org and becomes its admin", async () => {
    const made = await createAsA("Tenant A");
    expect(made.status).toBe(201);
    expect(made.role).toBe("admin");
    ({ id: orgA, name: orgAName, slug: orgASlug } = made);
  });

  it("a signed-in person not on our operator list cannot create a company", async () => {
    const tried = await strangerCreates((name, slug) =>
      JSON.stringify({ name, slug }),
    );
    expect(tried).toEqual({
      status: 403,
      body: { error: "not_an_operator" },
      refused: true,
    });
  });

  // Asked before the body is read, so a stranger can't learn which slugs are taken (409) or probe the body's shape.
  it("refuses a stranger before reading the body: a taken slug and a body that isn't JSON get the same 403", async () => {
    const taken = await strangerCreates((name) =>
      JSON.stringify({ name, slug: orgASlug }),
    );
    const garbled = await strangerCreates(() => "{not json");
    for (const tried of [taken, garbled])
      expect(tried).toEqual({
        status: 403,
        body: { error: "not_an_operator" },
        refused: true,
      });
  });

  // The other door to the companies table: the database's own data interface, with the stranger's sign-in token.
  // behaviour already on main: the orgs insert policy (002_rls.sql) lets in only a company the worker's transaction names
  it("refuses a stranger who inserts a company through the database's data interface", async () => {
    let status = 0;
    const made = companies.add("Data interface company", async (name, slug) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/orgs`, {
        method: "POST",
        headers: {
          apikey: ANON_KEY,
          authorization: `Bearer ${userB.token}`,
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({ name, slug }),
      });
      status = res.status;
      return res.ok
        ? (((await res.json()) as Array<{ id: string }>)[0]?.id ?? "")
        : "";
    });
    await expect(made).rejects.toThrow(/not made/);
    expect([401, 403]).toContain(status);
  });

  it("GET /orgs shows each user only their own orgs", async () => {
    const resA = await api("/orgs", userA.token);
    expect(resA.status).toBe(200);
    const orgsA = (await resA.json()) as Array<{ id: string }>;
    expect(orgsA.some((o) => o.id === orgA)).toBe(true);

    const resB = await api("/orgs", userB.token);
    const orgsB = (await resB.json()) as Array<{ id: string }>;
    expect(orgsB.some((o) => o.id === orgA)).toBe(false);
  });

  // The console's / landing opens the FIRST workspace, so GET /orgs must have a defined order: by name.
  it("GET /orgs lists a user's workspaces by name", async () => {
    const zulu = await createAsA("Zulu Org");
    const alpha = await createAsA("Alpha Org");
    expect([zulu.status, alpha.status]).toEqual([201, 201]);
    const orgs = (await (await api("/orgs", userA.token)).json()) as Array<{
      name: string;
    }>;
    expect(orgs.map((o) => o.name)).toEqual([alpha.name, orgAName, zulu.name]);
  });

  it("a non-member cannot add themselves to another tenant's org", async () => {
    const res = await api(`/orgs/${orgA}/members`, userB.token, {
      method: "POST",
      body: JSON.stringify({ userId: userB.userId, role: "admin" }),
    });
    expect(res.status).toBe(403);
  });

  it("admin invites a member; the member appears with the granted role", async () => {
    const res = await api(`/orgs/${orgA}/members`, userA.token, {
      method: "POST",
      body: JSON.stringify({ userId: userB.userId, role: "viewer" }),
    });
    expect(res.status).toBe(201);

    const resB = await api("/orgs", userB.token);
    const orgsB = (await resB.json()) as Array<{ id: string; role: string }>;
    const membership = orgsB.find((o) => o.id === orgA);
    expect(membership?.role).toBe("viewer");
  });

  it("a viewer cannot invite members (role gate, docs/security.md S1.7)", async () => {
    const other = await testUser(admin, "outsider");
    const res = await api(`/orgs/${orgA}/members`, userB.token, {
      method: "POST",
      body: JSON.stringify({ userId: other.userId, role: "viewer" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects an unknown-shape body before any logic (docs/security.md S5.1)", async () => {
    // Through the helper, so a regression that accepts the body still has its company cleaned up.
    let status = 0;
    const made = companies.add("Sneaky", async (name, slug) => {
      const res = await api("/orgs", userA.token, {
        method: "POST",
        body: JSON.stringify({ name, slug, sneaky: true }),
      });
      status = res.status;
      return res.ok ? ((await res.json()) as { id: string }).id : "";
    });
    await expect(made).rejects.toThrow(/not made/);
    expect(status).toBe(400);
  });
});
