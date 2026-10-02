// Two tenants stay isolated (the cross-tenant denial test AGENTS.md requires) — exercised at the
// API surface: real local GoTrue users, jose-verified JWTs, app_service DB path underneath.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { testCompanies } from "../../../tests/test-companies";
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

async function signup(tag: string): Promise<{ token: string; userId: string }> {
  const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password: "test-password-123!" }),
  });
  const body = (await res.json()) as {
    access_token?: string;
    user?: { id: string };
  };
  if (!body.access_token || !body.user)
    throw new Error(`signup failed: ${JSON.stringify(body)}`);
  return { token: body.access_token, userId: body.user.id };
}

function api(path: string, token: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
  );
}

let userA: { token: string; userId: string };
let userB: { token: string; userId: string };
let orgA = "";
let orgAName = "";

/** User A makes a company through POST /orgs, the route under test: its id and name, and the reply. */
async function createAsA(label: string) {
  let made = { name: "", status: 0, role: "" };
  const { id } = await companies.add(label, async (name, slug) => {
    const res = await api("/orgs", userA.token, {
      method: "POST",
      body: JSON.stringify({ name, slug }),
    });
    const body = (await res.json()) as { id: string; role: string };
    made = { name, status: res.status, role: body.role };
    return body.id;
  });
  return { id, ...made };
}

beforeAll(async () => {
  userA = await signup("tenant-a");
  userB = await signup("tenant-b");
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
    ({ id: orgA, name: orgAName } = made);
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
    const other = await signup("outsider");
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
