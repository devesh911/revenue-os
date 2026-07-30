// Task 51 acceptance (spec §12 — Analytics "Trends"): GET /orgs/:orgId/metrics/trends returns a
// 30-day daily time series { day, new_leads, conversations_started, bookings }. Tenancy-critical
// (a new org-scoped read endpoint), so this RED asserts every non-negotiable: 401 without a token,
// 403 for a non-member, and — the load-bearing case — org B's activity NEVER counts in org A's
// trends. Series semantics MUST mirror funnelMetrics (packages/db/src/screens.ts) exactly:
//   new_leads             = contacts where deleted_at is null,          bucketed by created_at::date
//   conversations_started = conversations,                              bucketed by started_at::date
//   bookings              = outcomes where kind = 'booking',            bucketed by occurred_at::date
// The fixture keeps every in-window row comfortably inside BOTH the tile's `>= now()-30d` cutoff and
// the 30 calendar-day bucket window, so tile total == sum of the 30 daily values is assertable.
// Real-DB suite (CI-owned): the worktree has no .env by rail, so this cannot run locally.
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

type Trend = {
  day: string;
  new_leads: number;
  conversations_started: number;
  bookings: number;
};

// Bootstrap an org owned by `token`, seed one contact + one conversation on `daysAgo`, and attach
// `bookings` booking outcomes on the same day. Returns the org id. `deleted` marks the contact
// soft-deleted (must be excluded from new_leads, mirroring funnelMetrics' `deleted_at is null`).
async function seedDay(
  orgId: string,
  daysAgo: number,
  bookings: number,
  deleted = false,
): Promise<void> {
  const ago = `now() - interval '${daysAgo} days'`;
  const contact = await admin.query(
    `insert into contacts (org_id, first_name, last_name, lifecycle_stage, created_at, deleted_at)
     values ($1, 'Trend', 'Fixture', 'new', ${ago}, ${deleted ? "now()" : "null"})
     returning id`,
    [orgId],
  );
  const contactId = contact.rows[0].id;
  const conv = await admin.query(
    `insert into conversations (org_id, contact_id, channel, direction, status, started_at)
     values ($1, $2, 'whatsapp', 'inbound', 'active', ${ago}) returning id`,
    [orgId, contactId],
  );
  for (let i = 0; i < bookings; i++) {
    await admin.query(
      `insert into outcomes (org_id, contact_id, conversation_id, kind, source, occurred_at)
       values ($1, $2, $3, 'booking', 'agent', ${ago})`,
      [orgId, contactId, conv.rows[0].id],
    );
  }
}

async function bootstrapOrg(token: string, tag: string): Promise<string> {
  const res = await api("/orgs", token, {
    method: "POST",
    body: JSON.stringify({
      name: `Trends ${tag}`,
      slug: `trends-${tag}-${Date.now()}`,
      vertical: "real_estate",
    }),
  });
  const body = (await res.json()) as { id?: string };
  if (res.status !== 201 || !body.id)
    throw new Error(`org bootstrap failed: ${res.status}`);
  return body.id;
}

// Expected org-A totals for the 30-day window (all seeded rows below are inside it):
//   new_leads = 3 (today, -5d, -28d; the -5d DELETED contact excluded), conversations_started = 3,
//   bookings  = 2 + 1 + 3 = 6. Today's bucket carries exactly 2 bookings.
const A_NEW_LEADS = 3;
const A_CONVS = 3;
const A_BOOKINGS = 6;
const A_TODAY_BOOKINGS = 2;

let userA: { token: string; userId: string };
let userB: { token: string; userId: string };
let orgA = "";

beforeAll(async () => {
  userA = await signup("trends-a");
  userB = await signup("trends-b");
  orgA = await bootstrapOrg(userA.token, "a");
  // In-window activity spread across three distinct days (leaves gaps to gap-fill).
  await seedDay(orgA, 0, A_TODAY_BOOKINGS); // today   → last bucket
  await seedDay(orgA, 5, 1); // -5 days
  await seedDay(orgA, 28, 3); // -28 days (still inside the 30-day window)
  await seedDay(orgA, 5, 9, true); // -5 days, DELETED contact — excluded from new_leads
  await seedDay(orgA, 45, 4); // out of window — must appear in NEITHER trends nor the tile

  // Cross-tenant noise: a SEPARATE org with heavy activity today. None of it may leak into orgA.
  const orgB = await bootstrapOrg(userB.token, "b");
  await seedDay(orgB, 0, 5);
});

const UTC = (day: string): number => Date.parse(`${day}T00:00:00Z`);
const DAY_MS = 86_400_000;

async function trendsOf(token: string | null): Promise<Response> {
  return api(`/orgs/${orgA}/metrics/trends`, token);
}

describe("auth + tenancy gates on GET /orgs/:orgId/metrics/trends", () => {
  it("no token → 401", async () => {
    const res = await trendsOf(null);
    expect(res.status).toBe(401);
  });

  it("authenticated non-member → 403, no trends payload leaked", async () => {
    const res = await trendsOf(userB.token);
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("trends");
  });
});

describe("member reads the 30-day daily series", () => {
  let trends: Trend[];
  beforeAll(async () => {
    const res = await trendsOf(userA.token);
    expect(res.status).toBe(200);
    ({ trends } = (await res.json()) as { trends: Trend[] });
  });

  it("shape: { trends: [ { day, new_leads, conversations_started, bookings } ] } with typed numbers", () => {
    expect(Array.isArray(trends)).toBe(true);
    for (const row of trends) {
      expect(typeof row.day).toBe("string");
      expect(row.day).toMatch(/^\d{4}-\d{2}-\d{2}$/); // 'YYYY-MM-DD' text
      expect(typeof row.new_leads).toBe("number");
      expect(typeof row.conversations_started).toBe("number");
      expect(typeof row.bookings).toBe("number");
    }
  });

  it("EXACTLY 30 rows, ascending and consecutive by day (no gaps in the calendar)", () => {
    expect(trends.length).toBe(30);
    for (let i = 1; i < trends.length; i++) {
      expect(UTC(trends[i].day) - UTC(trends[i - 1].day)).toBe(DAY_MS);
    }
  });

  it("the last bucket is today: it carries today's seeded activity", () => {
    const last = trends[29];
    expect(last.bookings).toBe(A_TODAY_BOOKINGS); // exactly the 2 booked today — no more (see cross-tenant)
    expect(last.new_leads).toBeGreaterThanOrEqual(1);
    expect(last.conversations_started).toBeGreaterThanOrEqual(1);
  });

  it("gap-filled: no-activity days are PRESENT with zeros, never omitted", () => {
    const active = trends.filter(
      (r) => r.new_leads > 0 || r.conversations_started > 0 || r.bookings > 0,
    );
    const zero = trends.filter(
      (r) =>
        r.new_leads === 0 && r.conversations_started === 0 && r.bookings === 0,
    );
    expect(active.length).toBe(3); // only today, -5d, -28d were seeded
    expect(zero.length).toBe(27); // the other 27 days are gap-filled with zeros
  });

  it("series mirror the funnel tiles: each 30-day total == the /metrics tile count", async () => {
    const res = await api(`/orgs/${orgA}/metrics`, userA.token);
    const { metrics } = (await res.json()) as {
      metrics: Record<string, number>;
    };
    const sum = (k: keyof Trend) =>
      trends.reduce((a, r) => a + (r[k] as number), 0);
    // absolute fixture semantics — deleted contact & out-of-window rows excluded from both sides
    expect(metrics.new_leads).toBe(A_NEW_LEADS);
    expect(metrics.conversations_started).toBe(A_CONVS);
    expect(metrics.bookings).toBe(A_BOOKINGS);
    // tile-vs-trend agreement (the mandated equality)
    expect(sum("new_leads")).toBe(metrics.new_leads);
    expect(sum("conversations_started")).toBe(metrics.conversations_started);
    expect(sum("bookings")).toBe(metrics.bookings);
  });
});

describe("cross-tenant denial (load-bearing): org B never counts in org A's trends", () => {
  it("org A's today bucket and totals reflect ONLY org A's rows, not org B's 5 today", async () => {
    const res = await trendsOf(userA.token);
    const { trends } = (await res.json()) as { trends: Trend[] };
    const sumBookings = trends.reduce((a, r) => a + r.bookings, 0);
    expect(trends[29].bookings).toBe(A_TODAY_BOOKINGS); // 2, not 2+5
    expect(sumBookings).toBe(A_BOOKINGS); // 6, not 6+5 — org B leakage would inflate this
  });
});
