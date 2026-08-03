// task-59 RED — the eval RUNNER, driven against the REAL local stack (real DB rows, real harness
// runTurn), with the two LLM-shaped seams (provider + persona player) INJECTED as mocks. Tests
// NEVER call Anthropic: the real provider is wired only at runtime via ANTHROPIC_API_KEY.
// REAL-DB INTEGRATION, CI-OWNED — a fresh worktree has no .env by rail.
//
// Covers acceptance criteria 1 (loading/malformed), 2 (driving via injected provider+player),
// 3 (sends captured not delivered), 4 (assertions engine, integration side), 5 (persistence),
// 6 (exit discipline + summary), 7 (--scenario scoping). Criterion 8 (RLS) lives in
// tests/eval-runs-rls.test.ts; the pure assertion semantics live in eval-assertions.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createPool, withOrg } from "@revenue-os/db";
import type { LlmProvider, LlmTurn, SendPort } from "@revenue-os/harness";
import pg from "pg";
import {
  type CapturedSend,
  type EvalDeps,
  loadScenarios,
  type PersonaPlayer,
  runEvals,
  runScenario,
} from "./eval-runner";

const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});
const appService = createPool(
  process.env.DATABASE_URL ||
    "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres",
);

let orgId = "";
let agentId = "";
let contactId = "";

const SLUG = "eval-runner-test";
const TOOLS = [
  "book_appointment",
  "update_contact",
  "send_confirmation",
] as const;

async function cleanup() {
  const sub = `select id from orgs where slug = '${SLUG}'`;
  // eval_runs / usage_events / audit_log have no on-delete cascade — clear before the org.
  await admin.query(`delete from eval_runs where org_id in (${sub})`);
  await admin.query(`delete from usage_events where org_id in (${sub})`);
  await admin.query(`delete from audit_log where org_id in (${sub})`);
  await admin.query(`delete from orgs where slug = '${SLUG}'`);
}

async function insertScenario(
  key: string,
  persona: string,
  script: string,
  assertions: string,
) {
  await admin.query(
    `insert into eval_scenarios (org_id, key, persona, script, assertions)
     values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)`,
    [orgId, key, persona, script, assertions],
  );
}

beforeAll(async () => {
  await cleanup();
  const org = await admin.query(
    `insert into orgs (name, slug) values ('Eval Runner Org', $1) returning id`,
    [SLUG],
  );
  orgId = org.rows[0].id;
  const agent = await admin.query(
    `insert into agents (org_id, key, version, status, model, system_prompt, tools_allowed)
     values ($1, 'eval-agent', 1, 'draft', 'claude-sonnet-4-6', 'You are a scheduler.', $2)
     returning id`,
    [orgId, TOOLS as unknown as string[]],
  );
  agentId = agent.rows[0].id;
  const contact = await admin.query(
    `insert into contacts (org_id, first_name) values ($1, 'Persona') returning id`,
    [orgId],
  );
  contactId = contact.rows[0].id;

  await insertScenario(
    "eager_buyer",
    '{"name":"Eager buyer","language":"en","traits":["decisive"]}',
    '{"turns":["asks about 2BHK","agrees to site visit"]}',
    '{"expect_outcome":"site_visit_booked"}',
  );
  await insertScenario(
    "always_passes",
    '{"name":"Trivial","language":"en"}',
    '{"turns":["says hi"]}',
    "{}",
  );
  await insertScenario(
    "needs_outcome",
    '{"name":"No-show","language":"en"}',
    '{"turns":["asks a question"]}',
    '{"expect_outcome":"site_visit_booked"}',
  );
  // criterion 1: a malformed persona (missing required name) must fail ONLY its own scenario.
  await insertScenario("malformed_persona", "{}", '{"turns":["hi"]}', "{}");
});

afterAll(async () => {
  await cleanup();
  await appService.end();
  await admin.end();
});

// ── seams: canned, never a real LLM ───────────────────────────────────────────────────────
function fakeLlm(turns: LlmTurn[]): LlmProvider & { calls: number } {
  const p = {
    calls: 0,
    complete: async () => {
      const t = turns[Math.min(p.calls, turns.length - 1)];
      p.calls += 1;
      return t;
    },
  };
  return p;
}

const textLlm = (): LlmProvider & { calls: number } =>
  fakeLlm([{ text: "Understood.", usage: { in: 10, out: 5 } }]);

/** Canned persona player: replays script.turns in order, then ends the conversation. */
const cannedPlayer: PersonaPlayer & { calls: number } = Object.assign(
  async (scn: { script: { turns: string[] } }, i: number) =>
    scn.script.turns[i] ?? null,
  { calls: 0 },
);

/** Eval-mode send: records instead of delivering. Inline so the only stub under test is runner. */
function makeCaptureSend(): { send: SendPort; captured: CapturedSend[] } {
  const captured: CapturedSend[] = [];
  const send: SendPort = async (ctx, msg) => {
    captured.push({ ctx, msg });
    return { ok: true };
  };
  return { send, captured };
}

function baseDeps(provider: LlmProvider, send: SendPort): EvalDeps {
  return {
    provider,
    player: cannedPlayer,
    send,
    agentId,
    systemPrompt: "You are a scheduler.",
    toolsAllowed: TOOLS,
  };
}

// ── Criterion 1: scenario loading + malformed-row tolerance ────────────────────────────────
describe("loadScenarios (criterion 1)", () => {
  it("Zod-parses valid rows and returns them", async () => {
    const res = await withOrg(appService, orgId, (tx) =>
      loadScenarios({ orgId, db: tx }),
    );
    const keys = res.scenarios.map((s) => s.key).sort();
    expect(keys).toContain("eager_buyer");
    expect(keys).toContain("always_passes");
  });

  it("a malformed scenario row is recorded as an error, not thrown, and does not drop the good rows", async () => {
    const res = await withOrg(appService, orgId, (tx) =>
      loadScenarios({ orgId, db: tx }),
    );
    // the good rows survived
    expect(res.scenarios.some((s) => s.key === "eager_buyer")).toBe(true);
    // the malformed one is absent from scenarios and present in errors
    expect(res.scenarios.some((s) => s.key === "malformed_persona")).toBe(
      false,
    );
    expect(res.errors.some((e) => e.key === "malformed_persona")).toBe(true);
  });
});

// ── Criterion 2: conversation driving via INJECTED provider + persona player ───────────────
describe("runScenario conversation driving (criterion 2)", () => {
  it("drives contact turns from the injected player and agent turns through the real runTurn with the injected provider", async () => {
    const provider = textLlm();
    const { send } = makeCaptureSend();
    const scenario = {
      id: "x",
      key: "always_passes",
      persona: { name: "Trivial", language: "en" },
      script: { turns: ["says hi", "says bye"] },
      assertions: {},
    };

    const result = await withOrg(appService, orgId, (tx) =>
      runScenario(baseDeps(provider, send), { orgId, db: tx }, scenario),
    );

    // the injected mock provider was the ONLY brain consulted (Anthropic never reachable in tests)
    expect(provider.calls).toBeGreaterThan(0);
    expect(result.conversationId).toBeDefined();

    const msgs = await admin.query(
      `select role from messages where conversation_id = $1 order by seq`,
      [result.conversationId],
    );
    const roles = msgs.rows.map((m) => m.role);
    expect(roles).toContain("contact"); // player turns persisted
    expect(roles).toContain("agent"); // real runTurn persisted the closing text
  });
});

// ── Criterion 3: sends are CAPTURED in eval mode, never delivered ──────────────────────────
describe("runScenario send capture (criterion 3)", () => {
  it("a scenario whose agent calls send_confirmation records the send and performs no real delivery", async () => {
    const provider = fakeLlm([
      {
        toolCalls: [
          {
            name: "send_confirmation",
            args: { contactId, channel: "whatsapp", body: "See you Saturday!" },
          },
        ],
        usage: { in: 40, out: 8 },
      },
      { text: "Sent.", usage: { in: 20, out: 4 } },
    ]);
    const { send, captured } = makeCaptureSend();
    const scenario = {
      id: "s",
      key: "always_passes",
      persona: { name: "Trivial", language: "en" },
      script: { turns: ["confirm my visit"] },
      assertions: {},
    };

    await withOrg(appService, orgId, (tx) =>
      runScenario(baseDeps(provider, send), { orgId, db: tx }, scenario),
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].msg.body).toBe("See you Saturday!");
  });
});

// ── Criteria 4 + 5: assertions engine (integration side) + persistence ─────────────────────
describe("runScenario assertions + persistence (criteria 4, 5)", () => {
  it("expect_outcome PASSES when the agent produces the outcome, and persists one eval_runs row", async () => {
    const provider = fakeLlm([
      {
        toolCalls: [
          {
            name: "book_appointment",
            args: {
              contactId,
              startsAt: "2026-09-01T10:00:00.000Z",
              endsAt: "2026-09-01T10:30:00.000Z",
              timezone: "Asia/Kolkata",
            },
          },
        ],
        usage: { in: 50, out: 12 },
      },
      { text: "Booked.", usage: { in: 30, out: 6 } },
    ]);
    const { send } = makeCaptureSend();
    const scenario = {
      id: "e",
      key: "eager_buyer",
      persona: { name: "Eager", language: "en" },
      script: { turns: ["book my visit"] },
      assertions: { expect_outcome: "site_visit_booked" },
    };

    const result = await withOrg(appService, orgId, (tx) =>
      runScenario(baseDeps(provider, send), { orgId, db: tx }, scenario),
    );

    expect(result.passed).toBe(true);
    const detail = result.scores.assertions.find(
      (a) => a.kind === "expect_outcome",
    );
    expect(detail?.passed).toBe(true);

    const rows = await admin.query(
      `select passed, scores, transcript_ref, agent_id, org_id
         from eval_runs where transcript_ref = $1`,
      [result.conversationId],
    );
    expect(rows.rowCount).toBe(1); // exactly one row per scenario
    expect(rows.rows[0].passed).toBe(true);
    expect(rows.rows[0].transcript_ref).toBe(result.conversationId);
    expect(rows.rows[0].agent_id).toBe(agentId);
    expect(rows.rows[0].org_id).toBe(orgId);
    // scores jsonb carries per-assertion detail (criterion 5 "at minimum")
    expect(JSON.stringify(rows.rows[0].scores)).toContain("site_visit_booked");
  });

  it("expect_outcome FAILS (and persists passed=false) when the agent never produces the outcome", async () => {
    const provider = textLlm();
    const { send } = makeCaptureSend();
    const scenario = {
      id: "n",
      key: "needs_outcome",
      persona: { name: "No-show", language: "en" },
      script: { turns: ["chats aimlessly"] },
      assertions: { expect_outcome: "site_visit_booked" },
    };

    const result = await withOrg(appService, orgId, (tx) =>
      runScenario(baseDeps(provider, send), { orgId, db: tx }, scenario),
    );

    expect(result.passed).toBe(false);
    const rows = await admin.query(
      `select passed from eval_runs where transcript_ref = $1`,
      [result.conversationId],
    );
    expect(rows.rows[0].passed).toBe(false);
  });
});

// ── Criterion 4 (must_capture, integration): the `captured` map is READ BACK from the contact
//    ROW (ground truth), never echoed from tool-call args. update_contact's real .strict() schema
//    writes first_name/last_name (verified in packages/harness/src/tools/update-contact.ts:9-18;
//    it CANNOT write budget_min/preferred_location — no such columns, unknown keys rejected). So
//    must_capture names the snake_case DB COLUMNS while the tool args are camelCase — arg-echo
//    (firstName/lastName) therefore cannot satisfy must_capture, which is the discriminator.
describe("runScenario must_capture ground truth (criterion 4)", () => {
  it("passes must_capture only when the named fields are present on the contact ROW the agent wrote (read-back, not arg-echo)", async () => {
    const provider = fakeLlm([
      {
        toolCalls: [
          {
            name: "update_contact",
            args: { contactId, firstName: "Ground", lastName: "Truth" },
          },
        ],
        usage: { in: 40, out: 9 },
      },
      { text: "Captured.", usage: { in: 20, out: 4 } },
    ]);
    const { send } = makeCaptureSend();
    const scenario = {
      id: "c",
      key: "capture_case",
      persona: { name: "Buyer", language: "en" },
      script: { turns: ["my name is Ground Truth"] },
      assertions: { must_capture: ["first_name", "last_name"] },
    };

    const result = await withOrg(appService, orgId, (tx) =>
      runScenario(baseDeps(provider, send), { orgId, db: tx }, scenario),
    );

    // (a) ground truth: the contact ROW actually holds the written fields
    const row = await admin.query(
      `select first_name, last_name from contacts where id = $1`,
      [contactId],
    );
    expect(row.rows[0].first_name).toBe("Ground");
    expect(row.rows[0].last_name).toBe("Truth");

    // (b) the engine read those fields back FROM the row (snake_case), not the camelCase args
    const byName = Object.fromEntries(
      result.scores.assertions.map((a) => [a.name, a]),
    );
    expect(byName.first_name?.kind).toBe("must_capture");
    expect(byName.first_name?.passed).toBe(true);
    expect(byName.last_name?.passed).toBe(true);
  });
});

// ── Criteria 6 + 7: exit discipline, summary, and --scenario scoping ───────────────────────
describe("runEvals exit discipline + scoping (criteria 6, 7)", () => {
  it("exits 1 when any scenario fails and prints one summary line per scenario key", async () => {
    const provider = textLlm(); // no tools → every expect_outcome scenario fails
    const { send } = makeCaptureSend();

    const out = await withOrg(appService, orgId, (tx) =>
      runEvals(baseDeps(provider, send), { orgId, db: tx }),
    );

    expect(out.exitCode).toBe(1); // eager_buyer/needs_outcome/malformed_persona fail
    expect(out.summary).toContain("always_passes");
    expect(out.summary).toContain("eager_buyer");
    // a malformed row is a recorded failure, never a crash of the whole run
    const malformed = out.results.find((r) => r.key === "malformed_persona");
    expect(malformed?.passed).toBe(false);
    expect(malformed?.error).toBeDefined();
  });

  it("all-pass runs exit 0", async () => {
    const provider = textLlm();
    const { send } = makeCaptureSend();
    const out = await withOrg(appService, orgId, (tx) =>
      runEvals(
        baseDeps(provider, send),
        { orgId, db: tx },
        {
          scenario: "always_passes",
        },
      ),
    );
    expect(out.exitCode).toBe(0);
  });

  it("--scenario <key> runs exactly one scenario (criterion 7)", async () => {
    const provider = textLlm();
    const { send } = makeCaptureSend();
    const out = await withOrg(appService, orgId, (tx) =>
      runEvals(
        baseDeps(provider, send),
        { orgId, db: tx },
        {
          scenario: "always_passes",
        },
      ),
    );
    expect(out.results).toHaveLength(1);
    expect(out.results[0].key).toBe("always_passes");
  });
});
