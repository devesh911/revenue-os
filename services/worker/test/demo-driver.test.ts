// biome-ignore-all lint/suspicious/noThenProperty: `then` is a workflow-step field (data, not a
// thenable) in the T26.2 definition JSON — the same suppression scheduler/handlers/m2-replay carry.
//
// task-60 (RED) — THE DEMO DRIVER acceptance suite. `bun run demo` sequences the full engine cycle
// locally with NO telephony and NO LLM cost and prints the run's journey. This suite drives the
// exported demo() (scripts/demo.ts) against the REAL local stack (Postgres + pg-boss + the real
// Vapi webhook receiver), with the voice sender / LLM / outcome ports STUBBED — exactly the M2
// replay's seam pattern. REAL-DB + REAL-RECEIVER INTEGRATION, CI-OWNED: it needs a migrated local
// DB AND VAPI_WEBHOOK_SECRET in the process env (the receiver reads process.env directly and 501s
// without it), so it does NOT run in a fresh worktree (no .env by rail). Each `it` derives from one
// acceptance criterion of the task-60 brief.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createPool } from "@revenue-os/db";
import pg from "pg";
import { PgBoss } from "pg-boss";
import {
  type DemoDeps,
  type DemoResult,
  demo,
  type JourneyStage,
} from "../../../scripts/demo";
import app from "../src/index";
import {
  makeFakeVoice,
  makeGuardSpy,
  makeScriptedLlm,
} from "./fixtures/fake-channels";
import { SimClock } from "./fixtures/sim-clock";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";
const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 4,
});
const appPool = createPool(DB_URL);
const boss = new PgBoss({
  connectionString: DB_URL,
  schema: "pgboss",
  createSchema: false,
});
const SECRET = process.env.VAPI_WEBHOOK_SECRET || "local-test-secret";

// Far-future daytime IST anchor (India has no DST) so guard's quiet-hours read is deterministic and
// the pending run (startRun stamps wake_at = wall now, ~2026) is due at this sim instant.
const START = "2030-06-03T04:30:00.000Z"; // 10:00 IST
const TZ = "Asia/Kolkata";

// The demo workflow: a call that routes the BUSINESS disposition straight into the branch's side
// effect — site_visit_agreed → book (writes a site_visit_booked outcome), callback → a callback
// task. Mirrors the seeded real_estate qualification branch's SEMANTICS (see the open question in
// the report re: the seeded workflow's intermediate `route` branch + lastDisposition clearing).
const DEMO_WF = {
  entry: "qualify_call",
  steps: {
    qualify_call: {
      kind: "call",
      agent: "qualifier",
      on: {
        site_visit_agreed: "book",
        callback: "callback_task",
        no_answer: "end",
        failed: "end",
      },
    },
    book: { kind: "tool", tool: "book_appointment", args: {}, then: "end" },
    callback_task: {
      kind: "tool",
      tool: "create_task",
      args: {
        kind: "callback",
        title: "Call back the buyer about the site visit",
      },
      then: "end",
    },
    end: { kind: "end" },
  },
};

let orgId = "";
let workflowId = "";

async function cleanup(): Promise<void> {
  await admin.query(`delete from pgboss.job where name = 'place_call'`);
  await admin.query(
    `delete from usage_events where org_id in (select id from orgs where slug like 'demo-driver-%')`,
  );
  await admin.query(
    `delete from audit_log where org_id in (select id from orgs where slug like 'demo-driver-%')`,
  );
  await admin.query(`delete from orgs where slug like 'demo-driver-%'`);
}

beforeAll(async () => {
  await boss.start();
  try {
    await boss.createQueue("place_call", { policy: "short" });
  } catch {
    // idempotent across reruns
  }
  await appPool.query(
    "grant select, delete on pgboss.job, pgboss.job_common to postgres",
  );
  await cleanup();

  orgId = (
    await admin.query(
      `insert into orgs (name, slug) values ('Demo Org', $1) returning id`,
      [`demo-driver-${Date.now()}`],
    )
  ).rows[0].id;
  await admin.query(
    `insert into agents (org_id, key, version, status, model, system_prompt, tools_allowed)
     values ($1, 'qualifier', 1, 'active', 'claude-fake', 'You are a qualifier.', '{book_appointment}')`,
    [orgId],
  );
  await admin.query(
    `insert into guardrail_policies (org_id, key, config, active)
     values ($1, 'quiet_hours', $2::jsonb, true), ($1, 'attempt_caps', $3::jsonb, true)`,
    [
      orgId,
      JSON.stringify({ start: "21:00", end: "07:00", tz: TZ }),
      JSON.stringify({
        voice: { max: 3, per_hours: 72 },
        whatsapp: { max: 2, per_hours: 24 },
      }),
    ],
  );
  workflowId = (
    await admin.query(
      `insert into workflows (org_id, key, version, status, definition)
       values ($1, 'demo-qual', 1, 'active', $2::jsonb) returning id`,
      [orgId, JSON.stringify(DEMO_WF)],
    )
  ).rows[0].id;
}, 60_000);

afterAll(async () => {
  await cleanup();
  await boss.stop({ graceful: true, timeout: 5_000 });
  await appPool.end();
  await admin.end();
});

let demoSeq = 0;

/** Build injected deps for ONE demo run and invoke demo(). Every effect port is a stub/fake: no
 *  telephony, no Anthropic, no network beyond the localhost receiver. Returns the result plus the
 *  fakes so a test can assert placeCount / the guard ledger (moat #4). */
async function runDemo(
  disposition: string,
  opts: { workflowId?: string } = {},
): Promise<{
  result: DemoResult;
  voice: ReturnType<typeof makeFakeVoice>;
  guardCalls: ReturnType<typeof makeGuardSpy>["calls"];
}> {
  demoSeq += 1;
  const clock = new SimClock(START);
  const voice = makeFakeVoice([disposition]);
  const guardSpy = makeGuardSpy(clock);
  const deps: DemoDeps = {
    pool: appPool,
    app,
    webhookSecret: SECRET,
    orgId,
    workflowId: opts.workflowId ?? workflowId,
    contact: {
      firstName: `Asha${demoSeq}`,
      phone: `+91987650${String(1000 + demoSeq)}`,
    },
    disposition,
    callId: `demo-call-${Date.now()}-${demoSeq}`,
    voice,
    provider: makeScriptedLlm([
      {
        text: "Hi, a quick chat about your enquiry.",
        usage: { in: 5, out: 3 },
      },
    ]),
    guard: guardSpy.fn,
    outcome: voice.outcome,
    now: () => clock.now(),
  };
  const result = await demo(deps);
  return { result, voice, guardCalls: guardSpy.calls };
}

/** The expected ordered stage sequence for a completed disposition path (criterion 7). */
const EXPECTED_STAGES: JourneyStage[] = [
  "enrolled",
  "tick_advanced",
  "call_placed",
  "webhook_simulated",
  "run_advanced",
  "terminal",
];

describe("demo driver — golden path (task-60)", () => {
  it("[criterion 1] enrolls a named contact via startRun and drives the run to a terminal state", async () => {
    const { result } = await runDemo("site_visit_agreed");
    expect(result.runId).toBeTruthy();
    expect(result.contactId).toBeTruthy();
    // enrolled → advanced → completed, with NO cron wait (tick driven directly).
    expect(result.terminalStatus).toBe("completed");

    const run = await admin.query(
      `select status, contact_id from workflow_runs where id = $1`,
      [result.runId],
    );
    expect(run.rows[0]?.status).toBe("completed");
    expect(run.rows[0]?.contact_id).toBe(result.contactId);
    // the enrolled contact exists under the demo org with the given name
    const contact = await admin.query(
      `select first_name from contacts where id = $1 and org_id = $2`,
      [result.contactId, orgId],
    );
    expect(contact.rows[0]?.first_name).toMatch(/^Asha/);
  });

  it("[criterion 7] returns the journey as ordered structured {stage, detail} data", async () => {
    const { result } = await runDemo("site_visit_agreed");
    // structured data, not a formatted blob
    for (const ev of result.journey) {
      expect(typeof ev.stage).toBe("string");
      expect(typeof ev.detail).toBe("string");
    }
    // the golden sequence, in order (criterion 7)
    expect(result.journey.map((e) => e.stage)).toEqual(EXPECTED_STAGES);
  });

  it("[criterion 3 · golden] site_visit_agreed advances the waiting run through the branch → a booking side effect", async () => {
    const { result } = await runDemo("site_visit_agreed");
    // the run left 'waiting' and completed by WALKING the branch to a terminal step
    const run = await admin.query(
      `select status, current_step from workflow_runs where id = $1`,
      [result.runId],
    );
    expect(run.rows[0]?.status).not.toBe("waiting");
    // the book branch's side effect: a site_visit_booked outcome attributed to THIS run's contact
    const outcome = await admin.query(
      `select id from outcomes where org_id = $1 and contact_id = $2 and kind = 'site_visit_booked'`,
      [orgId, result.contactId],
    );
    expect(outcome.rows.length).toBe(1);
  });

  it("[criterion 5] no real side effects: the stubbed voice sender fires exactly once and every send passed guard()", async () => {
    const { result, voice, guardCalls } = await runDemo("site_visit_agreed");
    expect(result.terminalStatus).toBe("completed");
    expect(voice.placeCount).toBe(1); // one stubbed placement — no telephony, no re-placement
    // moat #4: the send went through the real guard pipeline; no send bypassed the doorway
    const voiceGuards = guardCalls.filter((c) => c.channel === "voice");
    expect(voiceGuards.length).toBe(1);
    expect(voiceGuards.every((c) => c.ok)).toBe(true);
  });
});

/** POST a signed body to the REAL Vapi receiver route for the demo org (mirrors vapi-webhook.test). */
function postSigned(body: unknown): Promise<Response> {
  return app.fetch(
    new Request(`http://localhost/webhooks/vapi/${orgId}`, {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        "x-vapi-secret": SECRET,
      }),
      body: JSON.stringify(body),
    }),
  );
}

describe("demo driver — alternate branch (task-60, criterion 3)", () => {
  it("[criterion 3 · alternate] callback advances the run through the branch → a callback task row", async () => {
    const { result } = await runDemo("callback");
    expect(result.terminalStatus).toBe("completed");
    const task = await admin.query(
      `select kind from tasks where org_id = $1 and contact_id = $2 and kind = 'callback'`,
      [orgId, result.contactId],
    );
    expect(task.rows.length).toBe(1);
    // and NO booking outcome on the callback path
    const booked = await admin.query(
      `select id from outcomes where org_id = $1 and contact_id = $2 and kind = 'site_visit_booked'`,
      [orgId, result.contactId],
    );
    expect(booked.rows.length).toBe(0);
  });
});

describe("demo driver — real receiver + dedupe (task-60, criterion 2)", () => {
  it("[criterion 2] the demo's webhook goes through the REAL receiver and lands a webhook_events row", async () => {
    const { result } = await runDemo("site_visit_agreed");
    expect(result.terminalStatus).toBe("completed");
    const evs = await admin.query(
      `select count(*)::int n from webhook_events where org_id = $1 and provider = 'vapi'`,
      [orgId],
    );
    expect(evs.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it("[criterion 2] posting the SAME event twice does not double-apply (dedupe_key honored)", async () => {
    const callId = `demo-dedupe-${Date.now()}`;
    const event = {
      message: {
        type: "end-of-call-report",
        call: { id: callId },
        timestamp: "2030-06-03T04:31:00.000Z",
        id: `${callId}-eocr`,
        summary: "Qualified — agreed to a site visit.",
        endedReason: "hangup",
      },
    };
    expect((await postSigned(event)).status).toBe(202);
    expect((await postSigned(event)).status).toBe(202); // replay
    const r = await admin.query(
      `select count(*)::int n from webhook_events where dedupe_key = $1`,
      [`vapi:${callId}-eocr`],
    );
    expect(r.rows[0].n).toBe(1); // one row despite two posts
  });
});

describe("demo driver — re-runnable (task-60, criterion 4)", () => {
  it("[criterion 4] running demo() twice enrolls a FRESH run each time with no unique-collision crash", async () => {
    const first = await runDemo("site_visit_agreed");
    const second = await runDemo("site_visit_agreed");
    expect(second.result.runId).not.toBe(first.result.runId);
    expect(first.result.terminalStatus).toBe("completed");
    expect(second.result.terminalStatus).toBe("completed");
  });
});

describe("demo driver — tenancy (task-60, moat #3)", () => {
  it("[cross-tenant denial] a demo run scoped to org A never advances org B's due run", async () => {
    const orgB = (
      await admin.query(
        `insert into orgs (name, slug) values ('Demo Org B', $1) returning id`,
        [`demo-driver-b-${Date.now()}`],
      )
    ).rows[0].id;
    const contactB = (
      await admin.query(
        `insert into contacts (org_id, first_name) values ($1, 'Ben') returning id`,
        [orgB],
      )
    ).rows[0].id;
    const wfB = (
      await admin.query(
        `insert into workflows (org_id, key, version, status, definition)
         values ($1, 'demo-qual', 1, 'active', $2::jsonb) returning id`,
        [orgB, JSON.stringify(DEMO_WF)],
      )
    ).rows[0].id;
    const runB = (
      await admin.query(
        `insert into workflow_runs
           (org_id, workflow_id, contact_id, status, current_step, state, wake_at, attempts)
         values ($1, $2, $3, 'pending', 'qualify_call', $4::jsonb, now(), '{}'::jsonb) returning id`,
        [orgB, wfB, contactB, JSON.stringify({ contactId: contactB })],
      )
    ).rows[0].id;

    await runDemo("site_visit_agreed"); // demo drives ONLY org A

    const rb = await admin.query(
      `select status, current_step, attempts from workflow_runs where id = $1`,
      [runB],
    );
    expect(rb.rows[0].current_step).toBe("qualify_call"); // untouched
    expect(rb.rows[0].status).toBe("pending");
    expect(rb.rows[0].attempts.voice ?? []).toEqual([]); // never processed
    const jobsB = await admin.query(
      `select count(*)::int n from pgboss.job where data ->> 'runId' = $1`,
      [runB],
    );
    expect(jobsB.rows[0].n).toBe(0); // no place_call enqueued for org B
  });
});

// The VERBATIM seeded qualification definition (copied byte-for-byte from
// supabase/seeds/real_estate.sql — entry qualify_call, the retry/whatsapp/recall path, the `route`
// BRANCH, and the book/handoff/callback tool steps). Unlike DEMO_WF, the call step routes
// on.completed → `route`, and the BRANCH then routes onDisposition. This is the definition
// `bun run demo` faces against a real seeded org, so the acceptance suite MUST prove the golden
// path through it — not only through the simplified DEMO_WF (lessons.md: "a green test proved
// nothing twice — the fixture encoded a false world").
const SEEDED_QUAL_WF = {
  entry: "qualify_call",
  steps: {
    qualify_call: {
      kind: "call",
      agent: "qualifier",
      on: {
        completed: "route",
        no_answer: "retry_wait",
        busy: "retry_wait",
        failed: "end",
      },
    },
    retry_wait: { kind: "wait", for: "PT2H", then: "whatsapp_followup" },
    whatsapp_followup: {
      kind: "whatsapp",
      template: "followup_1",
      then: "recall_wait",
    },
    recall_wait: { kind: "wait_until", localTime: "11:00", then: "recall" },
    recall: {
      kind: "call",
      agent: "qualifier",
      on: { completed: "route", no_answer: "end", busy: "end", failed: "end" },
    },
    route: {
      kind: "branch",
      onDisposition: {
        site_visit_agreed: "book",
        interested: "handoff_task",
        callback: "callback_task",
        dnc: "end",
        "*": "end",
      },
    },
    book: { kind: "tool", tool: "book_appointment", args: {}, then: "end" },
    handoff_task: {
      kind: "tool",
      tool: "create_task",
      args: {
        kind: "handoff",
        title: "Hand a high-intent buyer to a human closer",
      },
      then: "end",
    },
    callback_task: {
      kind: "tool",
      tool: "create_task",
      args: {
        kind: "callback",
        title: "Call back the buyer about the site visit",
      },
      then: "end",
    },
    end: { kind: "end" },
  },
};

describe("demo driver — VERBATIM seeded qualification workflow (task-60)", () => {
  it("[criterion 3 · seeded def] completed → route → site_visit_agreed → book yields a booking, same outcomes as the golden path", async () => {
    // Seed the exact real_estate.sql `qualification` definition as ACTIVE and enroll a demo run into
    // IT (not DEMO_WF). The call resolves the qualified disposition; the run must WALK
    // qualify_call → route(branch) → book(tool) and complete with a site_visit_booked outcome.
    //
    // DO NOT WEAKEN if this fails: with the current engine a business disposition cannot survive to
    // `route`. place-call.ts folds ONE state.lastDisposition; the call re-entry consumes it via
    // on[disposition] (so it must be a CALL outcome to reach `route`); and scheduler.ts drive()
    // DELETES lastDisposition when advancing out of BOTH a `call` AND a `branch`. So at `route` the
    // disposition is already gone → it falls through onDisposition["*"] → end, and `book` is never
    // reached (no site_visit_booked outcome). That is a REAL defect the GREEN worker must fix (carry
    // the qualified disposition through the intermediate branch, or reshape how the outcome folds);
    // this assertion is the spec for `bun run demo` against a genuine seeded org.
    const seededWfId = (
      await admin.query(
        `insert into workflows (org_id, key, version, status, definition)
         values ($1, 'qualification', 1, 'active', $2::jsonb) returning id`,
        [orgId, JSON.stringify(SEEDED_QUAL_WF)],
      )
    ).rows[0].id;

    const { result } = await runDemo("site_visit_agreed", {
      workflowId: seededWfId,
    });

    // same terminal assertions as the golden path
    expect(result.terminalStatus).toBe("completed");
    const run = await admin.query(
      `select status from workflow_runs where id = $1`,
      [result.runId],
    );
    expect(run.rows[0]?.status).toBe("completed");

    // the book branch's side effect must exist — the run reached `book`, not `route`→"*"→end
    const outcome = await admin.query(
      `select id from outcomes where org_id = $1 and contact_id = $2 and kind = 'site_visit_booked'`,
      [orgId, result.contactId],
    );
    expect(outcome.rows.length).toBe(1);
  });
});
