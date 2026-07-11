// pg-boss wiring (tech-stack T7/T26.4): receivers enqueue, this consumer drains.
// RLS shapes the design — app_service cannot discover orgs cross-tenant, so the org id
// rides the JOB and the processor re-scopes itself via withOrg. A lost enqueue is safe
// by construction: processVapiEvents drains ALL 'received' events for the org, so any
// later job for that org catches strays. pgboss.* has no RLS (CLAUDE.md gotcha) —
// job payloads carry ids only, never PII.
import { OrgIdSchema } from "@revenue-os/shared";
import { PgBoss } from "pg-boss";
import { z } from "zod";
import { pool } from "./db";
import { env } from "./env";
import { logger } from "./logger";
import { processVapiEvents } from "./vapi/process";

export const WEBHOOK_PROCESS_VAPI = "webhook.process.vapi";
const VapiJobSchema = z.object({ orgId: OrgIdSchema });

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
      const { orgId } = VapiJobSchema.parse(job.data); // a job payload is a boundary (S5.1)
      await processVapiEvents(pool, orgId);
    }
  });
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
