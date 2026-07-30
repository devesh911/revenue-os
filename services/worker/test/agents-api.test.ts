// Task 50 (spec §12 — console AgentsPage on real data): GET /orgs/:orgId/agents returns the org's
// agents + workflows lists. Tenancy-critical NEW org-scoped read endpoint, so this RED is
// orchestrator-reviewed: 401 without a token, 403 for a non-member, and org B's rows NEVER leak
// into org A's response. It also pins the S5.8 lean wire shape (no system_prompt / voice_config /
// language_config on agents; no definition on workflows) and the deterministic order (key asc,
// then version desc).
//
// Real local stack (supabase + real pg) — CI-owned. It CANNOT run in a fresh worktree: signup goes
// through GoTrue (SUPABASE_URL / SUPABASE_ANON_KEY come from .env, absent by rail). Mirrors
// services/worker/test/screens-api.test.ts exactly (signup, POST /orgs, admin pool seeds rows).
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

async function makeOrg(token: string): Promise<string> {
  const res = await api("/orgs", token, {
    method: "POST",
    body: JSON.stringify({
      name: "Agents Org",
      slug: `agents-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      vertical: "real_estate",
    }),
  });
  const body = (await res.json()) as { id?: string };
  if (res.status !== 201 || !body.id)
    throw new Error(`org bootstrap failed: ${res.status}`);
  return body.id;
}

let userA: { token: string; userId: string };
let userB: { token: string; userId: string };
let orgA = "";
let orgB = "";
// Distinctive key prefix isolates these fixtures from any global-template rows (org_id IS NULL,
// readable by every member per migration 006) so the count/order asserts stay deterministic.
const PREFIX = `t50-${Date.now()}-`;

beforeAll(async () => {
  userA = await signup("agents-a");
  userB = await signup("agents-b");
  orgA = await makeOrg(userA.token);
  orgB = await makeOrg(userB.token);

  // orgA — two keys, one carrying two versions, to pin (key asc, version desc). Distinctive
  // system_prompt / definition values so the lean-shape asserts prove S5.8 (internals never shipped).
  await admin.query(
    `insert into agents (org_id, key, version, status, model, system_prompt)
     values ($1, $2, 1, 'active', 'model-alpha-v1', 'SECRET-PROMPT-ALPHA-1'),
            ($1, $2, 2, 'draft',  'model-alpha-v2', 'SECRET-PROMPT-ALPHA-2'),
            ($1, $3, 1, 'active', 'model-beta-v1',  'SECRET-PROMPT-BETA-1')`,
    [orgA, `${PREFIX}alpha`, `${PREFIX}beta`],
  );
  await admin.query(
    `insert into workflows (org_id, key, version, status, definition)
     values ($1, $2, 1, 'active', '{"secret":"WF-DEF-SECRET"}'::jsonb),
            ($1, $2, 2, 'draft',  '{"steps":[]}'::jsonb)`,
    [orgA, `${PREFIX}flow`],
  );

  // orgB — rows that must NEVER appear in orgA's response (the load-bearing cross-tenant assert).
  await admin.query(
    `insert into agents (org_id, key, version, status, model, system_prompt)
     values ($1, $2, 1, 'active', 'ORGB-MODEL-SECRET', 'ORGB-PROMPT-SECRET')`,
    [orgB, `${PREFIX}orgb`],
  );
  await admin.query(
    `insert into workflows (org_id, key, version, status, definition)
     values ($1, $2, 1, 'active', '{"secret":"ORGB-WF-SECRET"}'::jsonb)`,
    [orgB, `${PREFIX}orgb-flow`],
  );
});

type Row = Record<string, unknown>;

async function readAgents(): Promise<{ agents: Row[]; workflows: Row[] }> {
  const res = await api(`/orgs/${orgA}/agents`, userA.token);
  expect(res.status).toBe(200);
  return (await res.json()) as { agents: Row[]; workflows: Row[] };
}

describe("auth gate (S1.5)", () => {
  it("GET /orgs/:orgId/agents without a token → 401", async () => {
    const res = await api(`/orgs/${orgA}/agents`, null);
    expect(res.status).toBe(401);
  });
});

describe("cross-org denial (M0) — the load-bearing tenancy asserts", () => {
  it("non-member GET → 403, and no orgA row text leaks", async () => {
    const res = await api(`/orgs/${orgA}/agents`, userB.token);
    expect(res.status).toBe(403);
    const txt = await res.text();
    expect(txt).not.toContain(`${PREFIX}alpha`);
    expect(txt).not.toContain("SECRET-PROMPT-ALPHA");
  });

  it("member GET never returns another org's rows (RLS org-scoping)", async () => {
    const res = await api(`/orgs/${orgA}/agents`, userA.token);
    expect(res.status).toBe(200);
    const txt = await res.text();
    expect(txt).not.toContain(`${PREFIX}orgb`);
    expect(txt).not.toContain("ORGB-MODEL-SECRET");
    expect(txt).not.toContain("ORGB-PROMPT-SECRET");
    expect(txt).not.toContain("ORGB-WF-SECRET");
  });
});

describe("member reads the org's agents + workflows (task 50)", () => {
  it("responds with { agents, workflows } arrays", async () => {
    const body = await readAgents();
    expect(Array.isArray(body.agents)).toBe(true);
    expect(Array.isArray(body.workflows)).toBe(true);
  });

  it("agents carry the lean list fields and NOTHING internal (S5.8)", async () => {
    const mine = (await readAgents()).agents.filter((a) =>
      String(a.key).startsWith(PREFIX),
    );
    expect(mine.length).toBe(3);
    for (const a of mine) {
      for (const k of ["id", "key", "version", "status", "model", "created_at"])
        expect(a).toHaveProperty(k);
      expect(a).not.toHaveProperty("system_prompt");
      expect(a).not.toHaveProperty("voice_config");
      expect(a).not.toHaveProperty("language_config");
      expect(a).not.toHaveProperty("tools_allowed");
      expect(typeof a.version).toBe("number");
    }
  });

  it("workflows carry the lean list fields and NO definition (S5.8)", async () => {
    const mine = (await readAgents()).workflows.filter((w) =>
      String(w.key).startsWith(PREFIX),
    );
    expect(mine.length).toBe(2);
    for (const w of mine) {
      for (const k of ["id", "key", "version", "status", "created_at"])
        expect(w).toHaveProperty(k);
      expect(w).not.toHaveProperty("definition");
      expect(typeof w.version).toBe("number");
    }
  });

  it("deterministic order: key asc, then version desc (agents)", async () => {
    const seq = (await readAgents()).agents
      .filter((a) => String(a.key).startsWith(PREFIX))
      .map((a) => `${a.key}#${a.version}`);
    expect(seq).toEqual([
      `${PREFIX}alpha#2`,
      `${PREFIX}alpha#1`,
      `${PREFIX}beta#1`,
    ]);
  });

  it("deterministic order: key asc, then version desc (workflows)", async () => {
    const seq = (await readAgents()).workflows
      .filter((w) => String(w.key).startsWith(PREFIX))
      .map((w) => `${w.key}#${w.version}`);
    expect(seq).toEqual([`${PREFIX}flow#2`, `${PREFIX}flow#1`]);
  });

  it("never ships the seeded prompt / definition text on the wire (S5.8)", async () => {
    const txt = await (await api(`/orgs/${orgA}/agents`, userA.token)).text();
    expect(txt).not.toContain("SECRET-PROMPT-ALPHA");
    expect(txt).not.toContain("SECRET-PROMPT-BETA");
    expect(txt).not.toContain("WF-DEF-SECRET");
  });
});
