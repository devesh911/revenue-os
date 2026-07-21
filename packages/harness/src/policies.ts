// T26.1 — guard() pipeline: config-driven checks that run before ANY side effect (S8.2,
// moat invariant #4 — no code path around them). Hooks are ordered; first failing verdict wins.
// The skeleton ships the pipeline + the autonomy hook; dnc/quiet-hours/attempt-caps/spend-caps
// hooks land with packages/channels (P2) and read guardrail_policies rows.
// G1: runtime-agnostic.
import { isWithinQuietHours } from "./quiet-hours";
import type { GuardedAction, OrgCtx, PolicyHook, Verdict } from "./types";

/** Autonomy tiers: forbidden blocks outright; approval routes to a human task (T26.5). */
export const autonomyHook: PolicyHook = async (_ctx, action) => {
  if (action.autonomy === "forbidden")
    return { ok: false, reason: "forbidden" };
  if (action.autonomy === "approval")
    return { ok: false, reason: "approval_required" };
  return null;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_TZ = "Asia/Kolkata";

/**
 * Quiet-hours guardrail: blocks outbound SENDS during an org's configured quiet window
 * (guardrail_policies key 'quiet_hours', config {start,end,tz}). START inclusive, END
 * exclusive; tz 'contact' resolves per-contact (falling back to Asia/Kolkata), else a literal
 * IANA zone. Deliberately FAIL-OPEN: this is a courtesy gate, so a missing/malformed policy or
 * any DB hiccup returns null (pass) rather than blocking every send — a transient read error
 * must not silence all outbound traffic. (The future DNC hook is hard-safety and fails CLOSED;
 * do not copy this posture there.)
 */
export const quietHoursHook: PolicyHook = async (ctx, action) => {
  // Gate SENDS only — a non-send tool carries no channel and is never quieted.
  if (!action.channel) return null;
  try {
    const policy = await ctx.db.query(
      "select config from guardrail_policies where key = $1 and active = true limit 1",
      ["quiet_hours"],
    );
    const config = policy.rows[0]?.config as
      | Record<string, unknown>
      | undefined;
    if (!config) return null; // unconfigured = no restriction

    // Validate the window BEFORE any contact lookup — malformed config fails open.
    const start = config.start;
    const end = config.end;
    if (
      typeof start !== "string" ||
      typeof end !== "string" ||
      !HHMM.test(start) ||
      !HHMM.test(end)
    ) {
      return null;
    }

    const tzMode = config.tz;
    let zone: string;
    if (tzMode === "contact") {
      const c = await ctx.db.query(
        "select timezone from contacts where id = $1 limit 1",
        [action.contactId],
      );
      const contactTz = c.rows[0]?.timezone;
      zone =
        typeof contactTz === "string" && contactTz ? contactTz : DEFAULT_TZ;
    } else if (typeof tzMode === "string" && tzMode) {
      zone = tzMode; // literal IANA zone — no contacts lookup
    } else {
      return null; // unknown tz mode → fail open
    }

    return isWithinQuietHours(new Date(), start, end, zone)
      ? { ok: false, reason: "quiet_hours" }
      : null;
  } catch {
    // FAIL-OPEN: a transient DB error must not block every outbound send.
    return null;
  }
};

export const defaultPipeline: PolicyHook[] = [autonomyHook, quietHoursHook];

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
