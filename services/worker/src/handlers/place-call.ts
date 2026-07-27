// T7 (task-47) — place_call job handler. RED-phase THROWING STUB (no implementation).
// GREEN wires, in ONE withOrg(orgId) tx:
//   1. reload the run FOR UPDATE; NO-OP if stale (already produced an outcome, i.e. state
//      .lastDisposition present, or status != 'waiting', or current_step no longer a call step)
//      — exactly-once (M2).
//   2. guard() BEFORE the send (moat #4) via the channels voice doorway (voice.place, injected
//      sender + guard). A blocking verdict => NO send, no conversation, record + stop.
//   3. create a `conversations` row (channel voice, provider vapi, provider_ref = sender result,
//      workflow_run_id = run).
//   4. drive the call's conversation via runTurn(injected provider) so messages + usage_events land.
//   5. resolve the call OUTCOME via the injected `outcome` disposition port, FOLD it into
//      state.lastDisposition, and RE-ARM the run (status waiting, wake_at = now) so the next tick
//      routes the call re-entry.
// G-note: GREEN adds @revenue-os/channels to worker deps (+ a BOM row) to route the send through
// voice.place; this stub only declares the injectable seam types the test drives.

import type { ToolRegistry } from "@harness/registry";
import type {
  GuardedAction,
  LlmProvider,
  OrgCtx,
  Verdict,
} from "@harness/types";
import type { Pool } from "pg";

/** Voice sender port — a structural superset of channels' VoiceSender (kept local so the stub
 *  needs no channels dep). GREEN passes the real injected sender into voice.place. */
export type VoiceSenderPort = {
  place(payload: {
    to: string;
    assistantId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ providerRef: string }>;
};

/** The guard the doorway MUST call before any send (moat #4). Test injects a spy. */
export type GuardPort = (
  ctx: OrgCtx,
  action: GuardedAction,
) => Promise<Verdict>;

/** DESIGN DECISION (disposition flow): a "disposition port" — how the call OUTCOME reaches the
 *  handler (vs extending the voice result, or a call.post hop). Swappable for T9's FakeVoice
 *  (which resolves the scripted outcome); production backs it with the end-of-call report. */
export type OutcomePort = (
  ctx: OrgCtx,
  conversationId: string,
) => Promise<string>;

export type PlaceCallDeps = {
  pool: Pool;
  guard: GuardPort;
  sender: VoiceSenderPort;
  provider: LlmProvider; // the runTurn bridge's LLM (T9 injects FakeVoice's provider)
  registry: ToolRegistry; // runTurn's tool catalog (empty is fine for a text-only turn)
  outcome: OutcomePort;
  now?: () => Date;
};

export type PlaceCallJob = {
  orgId: string;
  runId: string;
  action: { kind: "place_call"; contactId: string; agentKey: string };
};

export async function handlePlaceCall(
  _deps: PlaceCallDeps,
  _job: PlaceCallJob,
): Promise<void> {
  throw new Error("T7 not implemented: place_call handler");
}
