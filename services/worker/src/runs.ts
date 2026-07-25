// T6 (task-46) — the run writer. STUB ONLY (RED phase): startRun is intentionally
// unimplemented so the integration suite (services/worker/test/scheduler.test.ts) fails on
// REAL behaviour, not on a missing module. GREEN replaces the body — this throw is NOT the
// contract. See the worker-contract in the RED report for the real signature + semantics.
import type { Pool } from "pg";

/** Input to startRun. `state` seeds the run's WorkflowState jsonb (contactId, timezone, vars). */
export type StartRunInput = {
  workflowId: string;
  contactId: string;
  campaignId?: string;
  state?: Record<string, unknown>;
};

/**
 * Create a workflow_run at the definition's entry step: status waiting/pending, current_step =
 * definition.entry, state seeded, attempts = {} (the per-channel timestamp arrays fill in later).
 * Returns the new run id. Runs inside one withOrg(orgId) tx (the only DB door).
 */
export async function startRun(
  _pool: Pool,
  _orgId: string,
  _input: StartRunInput,
): Promise<string> {
  throw new Error("not implemented: startRun (task-46 RED)");
}
