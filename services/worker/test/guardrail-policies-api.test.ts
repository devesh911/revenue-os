// task-52 acceptance — GET + PUT /orgs/:orgId/guardrail-policies on real data. Tenancy-critical
// (new org-scoped read/write on a new-table surface): every endpoint must 401 without a token,
// 403 for a non-member, and never leak/mutate another org's rows. PUT is admin-only (S1.7) and its
// strict Zod validation (packages/shared GuardrailPolicyInputSchema) is the safety boundary for the
// FAIL-OPEN quiet_hours hook — a malformed config must be rejected (400) with NOTHING written.
// Real GoTrue users, jose-verified JWTs, app_service DB path underneath. CI-owned (needs .env +
// local supabase + real pg — cannot run in an env-free worktree).
import { beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import app from "../src/index";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});

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

async function createOrg(token: string, slug: string): Promise<string> {
  const res = await api("/orgs", token, {
    method: "POST",
    body: JSON.stringify({ name: slug, slug, vertical: "real_estate" }),
  });
  const body = (await res.json()) as { id?: string };
  if (res.status !== 201 || !body.id)
    throw new Error(`org bootstrap failed: ${res.status}`);
  return body.id;
}

async function invite(
  adminToken: string,
  orgId: string,
  userId: string,
  role: string,
): Promise<void> {
  const res = await api(`/orgs/${orgId}/members`, adminToken, {
    method: "POST",
    body: JSON.stringify({ userId, role }),
  });
  if (res.status !== 201)
    throw new Error(`invite ${role} failed: ${res.status}`);
}

async function seedPolicy(
  orgId: string,
  key: string,
  config: unknown,
): Promise<void> {
  await admin.query(
    `insert into guardrail_policies (org_id, key, config) values ($1, $2, $3::jsonb)
       on conflict (org_id, key) do update set config = excluded.config`,
    [orgId, key, JSON.stringify(config)],
  );
}

type Policy = {
  key: string;
  config: Record<string, unknown>;
  active: boolean;
  updated_at: string;
};

let admin1: { token: string; userId: string }; // orgA admin
let orgBadmin: { token: string; userId: string }; // orgB admin (cross-tenant / non-member of A)
let operator: { token: string; userId: string };
let viewer: { token: string; userId: string };
let outsider: { token: string; userId: string }; // no org membership at all
let orgA = "";
let orgB = "";

beforeAll(async () => {
  admin1 = await signup("gp-admin");
  orgBadmin = await signup("gp-badmin");
  operator = await signup("gp-op");
  viewer = await signup("gp-viewer");
  outsider = await signup("gp-outsider");

  orgA = await createOrg(admin1.token, `gp-a-${Date.now()}`);
  orgB = await createOrg(orgBadmin.token, `gp-b-${Date.now()}`);

  // orgA: two known rows (mirrors the seed shapes). orgB: a DISTINCT quiet_hours row whose
  // start "08:00" is the cross-tenant leak canary — it must never appear in an orgA response.
  await seedPolicy(orgA, "quiet_hours", {
    start: "21:00",
    end: "09:00",
    tz: "contact",
  });
  await seedPolicy(orgA, "dnc", { hard_stop: true });
  await seedPolicy(orgB, "quiet_hours", {
    start: "08:00",
    end: "22:00",
    tz: "Asia/Kolkata",
  });

  await invite(admin1.token, orgA, operator.userId, "operator");
  await invite(admin1.token, orgA, viewer.userId, "viewer");
});

describe("GET /orgs/:orgId/guardrail-policies — auth + tenancy", () => {
  it("no token → 401", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, null);
    expect(res.status).toBe(401);
  });

  it("non-member (no org) → 403, no rows leaked", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, outsider.token);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("21:00");
  });

  it("cross-tenant admin (org B) reading org A → 403", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, orgBadmin.token);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("21:00");
  });

  it("any member (viewer) → 200 with {key,config,active,updated_at} rows", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, viewer.token);
    expect(res.status).toBe(200);
    const { policies } = (await res.json()) as { policies: Policy[] };
    const qh = policies.find((p) => p.key === "quiet_hours");
    expect(qh).toBeDefined();
    expect(qh?.config.start).toBe("21:00");
    expect(qh?.active).toBe(true);
    expect(qh).toHaveProperty("updated_at");
  });

  it("admin → 200 with exactly org A's rows (quiet_hours + dnc)", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token);
    expect(res.status).toBe(200);
    const { policies } = (await res.json()) as { policies: Policy[] };
    expect(policies.map((p) => p.key).sort()).toEqual(["dnc", "quiet_hours"]);
  });

  it("cross-tenant isolation: org B's '08:00' never appears in org A's response", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("08:00");
  });
});

describe("PUT /orgs/:orgId/guardrail-policies — admin-only (S1.7)", () => {
  const body = () =>
    JSON.stringify({ key: "autonomy", config: { book_appointment: "auto" } });

  it("no token → 401", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, null, {
      method: "PUT",
      body: body(),
    });
    expect(res.status).toBe(401);
  });

  it("operator → 403", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, operator.token, {
      method: "PUT",
      body: body(),
    });
    expect(res.status).toBe(403);
  });

  it("viewer → 403", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, viewer.token, {
      method: "PUT",
      body: body(),
    });
    expect(res.status).toBe(403);
  });

  it("non-member → 403", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, outsider.token, {
      method: "PUT",
      body: body(),
    });
    expect(res.status).toBe(403);
  });

  it("cross-tenant admin (org B) writing org A → 403, nothing written to A", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, orgBadmin.token, {
      method: "PUT",
      body: body(),
    });
    expect(res.status).toBe(403);
    const row = await admin.query(
      `select 1 from guardrail_policies where org_id = $1 and key = 'autonomy'`,
      [orgA],
    );
    expect(row.rowCount).toBe(0);
  });
});

describe("PUT — valid config upserts and round-trips (admin)", () => {
  it("creates a new key (autonomy), active defaults true → 200 { policy }", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token, {
      method: "PUT",
      body: JSON.stringify({
        key: "autonomy",
        config: { book_appointment: "auto", send_quote: "approval" },
      }),
    });
    expect(res.status).toBe(200);
    const { policy } = (await res.json()) as { policy: Policy };
    expect(policy.key).toBe("autonomy");
    expect(policy.config.send_quote).toBe("approval");
    expect(policy.active).toBe(true);
    expect(policy).toHaveProperty("updated_at");
  });

  it("GET now reflects the upserted autonomy row", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token);
    const { policies } = (await res.json()) as { policies: Policy[] };
    const a = policies.find((p) => p.key === "autonomy");
    expect(a?.config.book_appointment).toBe("auto");
  });

  it("active:false is honored and visible on the next GET", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token, {
      method: "PUT",
      body: JSON.stringify({
        key: "autonomy",
        config: { book_appointment: "auto" },
        active: false,
      }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { policy: Policy }).policy.active).toBe(
      false,
    );
    const get = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token);
    const { policies } = (await get.json()) as { policies: Policy[] };
    expect(policies.find((p) => p.key === "autonomy")?.active).toBe(false);
  });

  it("new quiet_hours config round-trips and updated_at moves forward", async () => {
    const before = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token);
    const t0 = ((await before.json()) as { policies: Policy[] }).policies.find(
      (p) => p.key === "quiet_hours",
    )?.updated_at as string;

    const res = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token, {
      method: "PUT",
      body: JSON.stringify({
        key: "quiet_hours",
        config: { start: "22:30", end: "07:15", tz: "contact" },
      }),
    });
    expect(res.status).toBe(200);
    const { policy } = (await res.json()) as { policy: Policy };
    expect(policy.config.start).toBe("22:30");
    expect(new Date(policy.updated_at).getTime()).toBeGreaterThan(
      new Date(t0).getTime(),
    );

    const get = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token);
    const { policies } = (await get.json()) as { policies: Policy[] };
    expect(policies.find((p) => p.key === "quiet_hours")?.config.start).toBe(
      "22:30",
    );
  });
});

describe("PUT — malformed config rejected (400), nothing written", () => {
  const bad: Array<[string, unknown]> = [
    [
      "quiet_hours start 25:00",
      {
        key: "quiet_hours",
        config: { start: "25:00", end: "09:00", tz: "contact" },
      },
    ],
    [
      "quiet_hours missing end",
      { key: "quiet_hours", config: { start: "21:00", tz: "contact" } },
    ],
    [
      "quiet_hours tz empty",
      { key: "quiet_hours", config: { start: "21:00", end: "09:00", tz: "" } },
    ],
    [
      "quiet_hours extra field",
      {
        key: "quiet_hours",
        config: { start: "21:00", end: "09:00", tz: "contact", x: 1 },
      },
    ],
    ["unknown key", { key: "spend_caps", config: {} }],
    [
      "attempt_caps unknown channel",
      {
        key: "attempt_caps",
        config: {
          voice: { max: 3, per_hours: 72 },
          whatsapp: { max: 2, per_hours: 24 },
          sms: { max: 1, per_hours: 1 },
        },
      },
    ],
    [
      "autonomy bad tier",
      { key: "autonomy", config: { book_appointment: "maybe" } },
    ],
  ];

  for (const [name, payload] of bad) {
    it(`400 for ${name}`, async () => {
      const res = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(400);
    });
  }

  it("a rejected quiet_hours PUT leaves the stored config untouched", async () => {
    const before = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token);
    const cfg0 = (
      (await before.json()) as { policies: Policy[] }
    ).policies.find((p) => p.key === "quiet_hours")?.config;

    const res = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token, {
      method: "PUT",
      body: JSON.stringify({
        key: "quiet_hours",
        config: { start: "25:00", end: "09:00", tz: "contact" },
      }),
    });
    expect(res.status).toBe(400);

    const after = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token);
    const cfg1 = ((await after.json()) as { policies: Policy[] }).policies.find(
      (p) => p.key === "quiet_hours",
    )?.config;
    expect(cfg1).toEqual(cfg0);
  });
});

describe("PUT — write tenancy: an org-A write never reaches org B", () => {
  it("admin PUT to org A creates no matching row in org B", async () => {
    const res = await api(`/orgs/${orgA}/guardrail-policies`, admin1.token, {
      method: "PUT",
      body: JSON.stringify({
        key: "attempt_caps",
        config: {
          voice: { max: 5, per_hours: 99 },
          whatsapp: { max: 4, per_hours: 48 },
        },
      }),
    });
    expect(res.status).toBe(200);

    const rowB = await admin.query(
      `select 1 from guardrail_policies where org_id = $1 and key = 'attempt_caps'`,
      [orgB],
    );
    expect(rowB.rowCount).toBe(0);

    const getB = await api(`/orgs/${orgB}/guardrail-policies`, orgBadmin.token);
    const { policies } = (await getB.json()) as { policies: Policy[] };
    expect(policies.some((p) => p.key === "attempt_caps")).toBe(false);
  });
});
