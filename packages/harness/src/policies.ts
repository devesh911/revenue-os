// T26.1 — guard() pipeline: config-driven checks that run before ANY side effect (S8.2,
// moat invariant #4 — no code path around them). Hooks are ordered; first failing verdict wins.
// The skeleton ships the pipeline + the autonomy hook; dnc/quiet-hours/attempt-caps/spend-caps
// hooks land with packages/channels (P2) and read guardrail_policies rows.
// G1: runtime-agnostic.
import type { GuardedAction, OrgCtx, PolicyHook, Verdict } from "./types";

/** Autonomy tiers: forbidden blocks outright; approval routes to a human task (T26.5). */
export const autonomyHook: PolicyHook = async (_ctx, action) => {
  if (action.autonomy === "forbidden")
    return { ok: false, reason: "forbidden" };
  if (action.autonomy === "approval")
    return { ok: false, reason: "approval_required" };
  return null;
};

export const defaultPipeline: PolicyHook[] = [autonomyHook];

export async function guard(
  ctx: OrgCtx,
  action: GuardedAction,
  pipeline: PolicyHook[] = defaultPipeline,
): Promise<Verdict> {
  for (const hook of pipeline) {
    const verdict = await hook(ctx, action);
    if (verdict && !verdict.ok) return verdict;
  }
  return { ok: true };
}
