// Task 15 acceptance (spec §12 E: four console screens on real data) — API surface for the
// screens: tasks / contacts / conversations lists + the six funnel metrics. Tenancy-critical
// (new org-scoped read endpoints), so this RED is orchestrator-authored: every endpoint must
// 401 without a token, 403 for a non-member, and never leak another org's rows.
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

const ENDPOINTS = ["tasks", "contacts", "conversations", "metrics"] as const;

let userA: { token: string; userId: string };
let userB: { token: string; userId: string };
let orgA = "";
let contactId = "";

beforeAll(async () => {
  userA = await signup("screens-a");
  userB = await signup("screens-b");
  const res = await api("/orgs", userA.token, {
    method: "POST",
    body: JSON.stringify({
      name: "Screens Org",
      slug: `screens-${Date.now()}`,
      vertical: "real_estate",
    }),
  });
  const body = (await res.json()) as { id?: string };
  if (res.status !== 201 || !body.id)
    throw new Error(`org bootstrap failed: ${res.status}`);
  orgA = body.id;

  // Fixture rows straight into the org (owner connection; RLS is exercised by the read path).
  const contact = await admin.query(
    `insert into contacts (org_id, first_name, last_name, lifecycle_stage)
     values ($1, 'Asha', 'Verma', 'new') returning id`,
    [orgA],
  );
  contactId = contact.rows[0].id;
  const active = await admin.query(
    `insert into conversations (org_id, contact_id, channel, direction, status, started_at)
     values ($1, $2, 'whatsapp', 'inbound', 'active', now()) returning id`,
    [orgA, contactId],
  );
  await admin.query(
    `insert into conversations (org_id, contact_id, channel, direction, status, started_at, ended_at)
     values ($1, $2, 'voice', 'inbound', 'completed', now() - interval '1 hour', now())`,
    [orgA, contactId],
  );
  await admin.query(
    `insert into outcomes (org_id, contact_id, conversation_id, kind, source, occurred_at)
     values ($1, $2, $3, 'qualified', 'agent', now()),
            ($1, $2, $3, 'booking', 'agent', now())`,
    [orgA, contactId, active.rows[0].id],
  );
  await admin.query(
    `insert into tasks (org_id, contact_id, conversation_id, kind, status, priority, title)
     values ($1, $2, $3, 'approval', 'open', 1, 'Approve quote for Asha')`,
    [orgA, contactId, active.rows[0].id],
  );
});

describe("auth gate (S1.5) on every screen endpoint", () => {
  for (const ep of ENDPOINTS) {
    it(`GET /orgs/:orgId/${ep} without a token → 401`, async () => {
      const res = await api(`/orgs/${orgA}/${ep}`, null);
      expect(res.status).toBe(401);
    });
  }
});

describe("cross-org denial (M0) on every screen endpoint", () => {
  for (const ep of ENDPOINTS) {
    it(`non-member GET /orgs/:orgId/${ep} → 403, no rows`, async () => {
      const res = await api(`/orgs/${orgA}/${ep}`, userB.token);
      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).not.toContain(contactId);
      expect(text).not.toContain("Asha");
    });
  }
});

describe("member reads real rows", () => {
  it("tasks: the open approval task, with title and linkage", async () => {
    const res = await api(`/orgs/${orgA}/tasks`, userA.token);
    expect(res.status).toBe(200);
    const { tasks } = (await res.json()) as {
      tasks: Array<Record<string, unknown>>;
    };
    const task = tasks.find((t) => t.title === "Approve quote for Asha");
    expect(task).toBeDefined();
    expect(task?.status).toBe("open");
    expect(task?.kind).toBe("approval");
    expect(task?.conversation_id).toBeTruthy();
  });

  it("contacts: the seeded contact with lifecycle + score fields", async () => {
    const res = await api(`/orgs/${orgA}/contacts`, userA.token);
    expect(res.status).toBe(200);
    const { contacts } = (await res.json()) as {
      contacts: Array<Record<string, unknown>>;
    };
    const row = contacts.find((c) => c.id === contactId);
    expect(row).toBeDefined();
    expect(row?.first_name).toBe("Asha");
    expect(row?.lifecycle_stage).toBe("new");
    expect(row).toHaveProperty("score");
    expect(row).toHaveProperty("last_interaction_at");
  });

  it("conversations: both rows, each with channel/status/contact name for the monitor", async () => {
    const res = await api(`/orgs/${orgA}/conversations`, userA.token);
    expect(res.status).toBe(200);
    const { conversations } = (await res.json()) as {
      conversations: Array<Record<string, unknown>>;
    };
    expect(conversations.length).toBe(2);
    const statuses = conversations.map((c) => c.status).sort();
    expect(statuses).toEqual(["active", "completed"]);
    for (const c of conversations) {
      expect(c.id).toBeTruthy();
      expect(["voice", "whatsapp"]).toContain(c.channel as string);
      expect(c.contact_name).toBe("Asha Verma");
      expect(c).toHaveProperty("started_at");
    }
  });

  it("metrics: the six funnel numbers reflect the fixture rows (30-day window)", async () => {
    const res = await api(`/orgs/${orgA}/metrics`, userA.token);
    expect(res.status).toBe(200);
    const { metrics } = (await res.json()) as {
      metrics: Record<string, number>;
    };
    expect(metrics.new_leads).toBe(1);
    expect(metrics.conversations_started).toBe(2);
    expect(metrics.conversations_completed).toBe(1);
    expect(metrics.qualified).toBe(1);
    expect(metrics.bookings).toBe(1);
    expect(metrics.open_tasks).toBe(1);
  });
});
