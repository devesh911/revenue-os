// pg-boss wiring (tech-stack T7/T26.4): receivers enqueue, this consumer drains.
// RLS shapes the design — app_service cannot discover orgs cross-tenant, so the org id
// rides the JOB and the processor re-scopes itself via withOrg. A lost enqueue is safe
// by construction: processVapiEvents drains ALL 'received' events for the org, so any
// later job for that org catches strays. pgboss.* has no RLS (CLAUDE.md gotcha) —
// job payloads carry ids only, never PII.
import {
  buildCatalog,
  createAnthropicProvider,
  guard,
  type LlmProvider,
  type SendPort,
} from "@revenue-os/harness";
import { OrgIdSchema } from "@revenue-os/shared";
import { PgBoss } from "pg-boss";
import { z } from "zod";
import { pool } from "./db";
import { type Env, env } from "./env";
import { type AgentTurnJob, handleAgentTurn } from "./handlers/agent-turn";
import { type CallPostJob, handleCallPost } from "./handlers/call-post";
import {
  handlePlaceCall,
  type OutcomePort,
  type PlaceCallJob,
  type VoiceSenderPort,
} from "./handlers/place-call";
import {
  handleSendWa,
  type SendWaJob,
  type WaSenderPort,
} from "./handlers/send-wa";
import { logger } from "./logger";
import { ACTION_QUEUES, tick } from "./scheduler";
import { processVapiEvents } from "./vapi/process";

export const WEBHOOK_PROCESS_VAPI = "webhook.process.vapi";
const CALL_POST_QUEUE = "call.post"; // place_call's dead-letter SINK (handleCallPost drains it)
const TICK_QUEUE = "scheduler.tick"; // the durable pg-boss schedule that fires the scheduler tick
// A job payload is a boundary (S5.1): validate the tenancy field before a handler re-scopes on it.
const JobEnvelope = z.object({ orgId: OrgIdSchema });

/**
 * Construct the production Claude provider — but ONLY when a key is configured. Returns null with
 * no key so the worker still BOOTS (no LLM until a key is set). Pure construction: no network until
 * .complete() is first called (the raw-fetch adapter only fetches inside complete). Returns the
 * provider itself, not a registry entry — the caller injects it straight into the handler deps.
 */
export function makeProvider(env: Env): LlmProvider | null {
  return env.ANTHROPIC_API_KEY
    ? createAnthropicProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        model: "claude-opus-4-8",
      })
    : null;
}

// Live telephony (Vapi voice + Meta WhatsApp senders), the call-outcome port, the confirmation
// send seam, and the LLM provider when no key is set are all STUBBED here: production boot wires
// the SHAPE, T9 (the M2 replay) swaps in the real adapters / FakeVoice / FakeWa. Every stub THROWS
// when invoked so a misconfigured effect fails LOUDLY rather than silently no-op'ing; boot stays
// green because a stub is a plain object, constructed without a throw.
// ponytail: live-telephony stub — real Vapi/Meta senders + outcome port land in T9.
function notWired(what: string): never {
  throw new Error(`${what} not wired (stub — T9 swaps the real adapter)`);
}
const VOICE_STUB: VoiceSenderPort = {
  place: () => notWired("voice sender (Vapi)"),
};
const WA_STUB: WaSenderPort = {
  send: () => notWired("whatsapp sender (Meta)"),
};
const OUTCOME_STUB: OutcomePort = () => notWired("call outcome port");
const UNWIRED_SEND: SendPort = () => notWired("confirmation send");
const UNCONFIGURED_PROVIDER: LlmProvider = {
  complete: () => notWired("LLM provider — set ANTHROPIC_API_KEY"),
};

let boss: PgBoss | null = null;

export async function startJobs(): Promise<void> {
  if (boss) return;
  const b = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: "pgboss",
    // The schema itself ships in migration 015 — app_service has CREATE inside it,
    // not on the database, so pg-boss must not attempt CREATE SCHEMA (verified: it
    // fails with 42501 otherwise).
    createSchema: false,
  });
  b.on("error", (err) => logger.error({ err }, "pg-boss"));
  await b.start();
  // T26.4 retry posture: 3 tries, 60s apart, 15-minute expiry; permanently failed
  // jobs stay queryable in pgboss.job (dead-letter review task lands with the harness).
  await b.createQueue(WEBHOOK_PROCESS_VAPI, {
    retryLimit: 3,
    retryDelay: 60,
    expireInSeconds: 900,
  });
  await b.work(WEBHOOK_PROCESS_VAPI, async (jobs) => {
    for (const job of jobs) {
      const { orgId } = JobEnvelope.parse(job.data); // a job payload is a boundary (S5.1)
      await processVapiEvents(pool, orgId);
    }
  });

  // --- T8: external-action queues + their T7 handlers ---------------------------------------
  // The call.post dead-letter SINK first so place_call can reference it as its deadLetter. Each
  // action queue is policy 'short': the T6 singleton_key dedup rides pgboss.job's job_i1 index
  // (state='created' AND policy='short') and scheduler.enqueueJob writes 'short' — any other policy
  // would break exactly-once.
  await b.createQueue(CALL_POST_QUEUE);
  for (const q of ACTION_QUEUES) {
    await b.createQueue(
      q,
      q === "place_call"
        ? { policy: "short", deadLetter: CALL_POST_QUEUE }
        : { policy: "short" },
    );
  }

  // Shared handler deps. A missing key yields a stub provider (boot stays green — see makeProvider),
  // and live telephony / send seams are stubbed until T9. The guard pipeline is the real one (moat
  // #4 — no send bypasses it). Each work loop parses the payload's org id as a boundary (S5.1).
  const provider = makeProvider(env) ?? UNCONFIGURED_PROVIDER;
  const registry = buildCatalog({ send: UNWIRED_SEND });

  await b.work<PlaceCallJob>("place_call", async (jobs) => {
    for (const job of jobs) {
      JobEnvelope.parse(job.data);
      await handlePlaceCall(
        {
          pool,
          guard,
          sender: VOICE_STUB,
          provider,
          registry,
          outcome: OUTCOME_STUB,
        },
        job.data,
      );
    }
  });
  await b.work<SendWaJob>("send_wa", async (jobs) => {
    for (const job of jobs) {
      JobEnvelope.parse(job.data);
      await handleSendWa({ pool, guard, sender: WA_STUB }, job.data);
    }
  });
  await b.work<AgentTurnJob>("run_agent_turn", async (jobs) => {
    for (const job of jobs) {
      JobEnvelope.parse(job.data);
      await handleAgentTurn({ pool, provider, registry }, job.data);
    }
  });
  // The dead-letter SINK tolerates a partial/malformed payload by design (handleCallPost self-guards
  // and never throws), so it takes the raw job data without the strict envelope parse.
  await b.work<CallPostJob>(CALL_POST_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await handleCallPost({ pool }, job.data);
    }
  });

  // --- T8: the scheduler tick, scheduled DURABLY via pg-boss (survives restarts, unlike a
  // per-process setInterval a redeploy would silently drop). 1-minute cron is pg-boss's finest
  // granularity — fine for day-scale runs; the M2 replay (T9) drives tick() per-org directly.
  await b.createQueue(TICK_QUEUE);
  await b.work(TICK_QUEUE, async () => {
    await runScheduledTick();
  });
  await b.schedule(TICK_QUEUE, "* * * * *");

  boss = b;
}

export async function stopJobs(): Promise<void> {
  if (!boss) return;
  const b = boss;
  boss = null;
  await b.stop({ graceful: true, timeout: 5_000 });
}

/** Nudge the consumer after a webhook insert commits. Never throws into the receiver:
 * the 202 already happened at the provider's side of the contract, and the event row
 * (status 'received') is the durable fact a later drain recovers. */
export async function enqueueVapiProcess(orgId: string): Promise<void> {
  if (!boss) return; // receiver-only contexts (e.g. unit tests) run without a consumer
  try {
    await boss.send(WEBHOOK_PROCESS_VAPI, { orgId });
  } catch (err) {
    logger.error({ err, org_id: orgId }, "enqueue webhook.process.vapi failed");
  }
}

/**
 * The pg-boss-scheduled tick: discover orgs with due runs and drive each through the scheduler's
 * per-org `tick`. app_service is RLS-bound, so this cross-tenant scan of workflow_runs returns
 * nothing without a request.org_id scope — in production the fan-out is EMPTY until an RLS-exempt
 * org enumerator lands, which is why the read is wrapped: an RLS error means "tick what's visible"
 * (nothing), never a crashed tick. The M2 replay (T9) drives tick() per-org directly, so day-scale
 * runs never depend on this discovery. See CLEANUP-LEDGER.
 * ponytail: single-tenant fan-out ceiling — cross-tenant org discovery needs a SECURITY DEFINER
 * enumerator (or the postgres role); wire it when multi-tenant scheduling actually matters.
 */
async function runScheduledTick(): Promise<void> {
  const now = new Date();
  let orgIds: string[] = [];
  try {
    const r = await pool.query<{ org_id: string }>(
      `select distinct org_id from workflow_runs
        where status in ('pending', 'waiting') and wake_at <= now()`,
    );
    orgIds = r.rows.map((row) => row.org_id);
  } catch (err) {
    logger.error({ err }, "scheduler tick: org discovery unavailable (RLS)");
  }
  for (const orgId of orgIds) {
    try {
      await tick(pool, orgId, { now });
    } catch (err) {
      logger.error({ err, org_id: orgId }, "scheduler tick failed for org");
    }
  }
}
