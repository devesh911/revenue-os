// Task 4 acceptance (project-spec §12): two tenants isolated (M0 check) — exercised at the
// API surface: real local GoTrue users, jose-verified JWTs, app_service DB path underneath.
import { beforeAll, describe, expect, it } from "bun:test";
import app from "../src/index";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

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

beforeAll(async () => {
  userA = await signup("tenant-a");
  userB = await signup("tenant-b");
});

describe("auth gate (S1.5)", () => {
  it("rejects requests with no token", async () => {
    const res = await api("/orgs", null);
    expect(res.status).toBe(401);
  });

  it("rejects a garbage token", async () => {
    const res = await api("/orgs", "not.a.jwt");
    expect(res.status).toBe(401);
  });
});

describe("org bootstrap + M0 isolation", () => {
  it("user A creates an org and becomes its admin", async () => {
    const res = await api("/orgs", userA.token, {
      method: "POST",
      body: JSON.stringify({
        name: "Tenant A",
        slug: `tenant-a-${Date.now()}`,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; role: string };
    expect(body.role).toBe("admin");
    orgA = body.id;
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

  it("a viewer cannot invite members (S1.7 role gate)", async () => {
    const other = await signup("outsider");
    const res = await api(`/orgs/${orgA}/members`, userB.token, {
      method: "POST",
      body: JSON.stringify({ userId: other.userId, role: "viewer" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects an unknown-shape body before any logic (S5.1)", async () => {
    const res = await api("/orgs", userA.token, {
      method: "POST",
      body: JSON.stringify({
        name: "X",
        slug: `x-${Date.now()}`,
        sneaky: true,
      }),
    });
    expect(res.status).toBe(400);
  });
});
