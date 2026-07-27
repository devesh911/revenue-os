// T7 (task-47) — call.post handler: the dead-letter SINK for a failed / retry-exhausted call
// job. RED-phase THROWING STUB (no implementation). GREEN wires, in ONE withOrg(orgId) tx:
//   record the failure (workflow_runs.last_error + a `review` task on the run) so a human can
//   act — and NEVER throws (a poisoned payload must not crash the queue).
import type { Pool } from "pg";

export type CallPostDeps = {
  pool: Pool;
  now?: () => Date;
};

/** A failed/exhausted job's payload as pg-boss hands it to the dead-letter handler: the original
 *  ids may be partial and `error` carries the failure reason. Everything is optional on purpose —
 *  the handler must survive a malformed payload without throwing. */
export type CallPostJob = {
  orgId: string;
  runId?: string;
  action?: { kind: string };
  error?: string;
};

export async function handleCallPost(
  _deps: CallPostDeps,
  _job: CallPostJob,
): Promise<void> {
  throw new Error("T7 not implemented: call_post handler");
}
