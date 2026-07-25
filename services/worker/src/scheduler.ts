// T6 (task-46) — the scheduler tick. STUB ONLY (RED phase): tick is intentionally
// unimplemented so the integration suite fails on REAL behaviour, not on a missing module.
// GREEN replaces the body — this throw is NOT the contract. See the RED report's
// worker-contract for the real signature, the one-tx ordering, and the park-vs-advance rule.
import type { Pool } from "pg";

/** The clock seam (criterion 7): the M2 SimClock injects `now`; production passes new Date(). */
export type TickCtx = { now: Date };

/** One tick's summary — how many due runs were advanced this tick. */
export type TickResult = { processed: number };

/**
 * Select due runs (wake_at <= ctx.now, status waiting/pending) FOR UPDATE SKIP LOCKED, run the
 * pure interpreter, and apply each Transition in ONE withOrg tx: enqueue external actions as
 * pgboss.job rows (singleton_key `<runId>:<step>:<idx>`), apply inline actions in the SAME tx,
 * then advance the run (status/current_step/state/wake_at/attempts). A dangling-ref interpret
 * throw fails-the-run; it never crashes the tick.
 */
export async function tick(
  _pool: Pool,
  _orgId: string,
  _ctx: TickCtx,
): Promise<TickResult> {
  throw new Error("not implemented: tick (task-46 RED)");
}
