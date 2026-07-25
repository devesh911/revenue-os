// biome-ignore-all lint/suspicious/noThenProperty: `then` is a workflow step field (data,
// not a thenable) in the T26.2 definition JSON, e.g. { kind:"wait", for:"PT2H", then:"..." }.
// T1 (T26.2) — workflow-definition JSON schema + the workflow type contract.
//
// WorkflowDefinitionSchema validates workflows.definition: a CLOSED discriminated union on
// `kind` (an out-of-set kind fails safeParse). The TYPE contract below is the spec the
// interpreter, the scheduler (T6), and the handlers (T7) satisfy; types live HERE in
// src/workflow/ — never in the shared src/types.ts. G1: runtime-agnostic (no bun:* imports).
import { z } from "zod";

/** Closed set of step kinds. Adding one is a code change + ADR, never ad-hoc JSON. */
export type StepKind =
  | "call"
  | "wait"
  | "wait_until"
  | "whatsapp"
  | "branch"
  | "tool"
  | "end";

/** workflow_runs.status — the `app.run_status` enum (db-design.md). `running` is a
 *  transient, never-persisted resting state: it means "keep interpreting in this tick"
 *  (the scheduler chains routing steps until the run parks `waiting` or ends). */
export type RunStatus =
  | "pending"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "canceled";

/** A single step. Per-kind fields (on/for/localTime/then/template/onDisposition/tool/args)
 *  are pinned by the zod schema (worker); the type stays structural so the JSON round-trips. */
export type Step = { kind: StepKind } & Record<string, unknown>;

/** The JSON stored in workflows.definition. */
export type WorkflowDefinition = {
  entry: string;
  steps: Record<string, Step>;
};

/** The interpreter's view of a workflow_run (current_step column + state jsonb), assembled
 *  by the scheduler before each `interpret` call.
 *
 *  `lastDisposition` is the routing signal the handler folds into `state` before a wake:
 *    • parked on a `call` step  → the call OUTCOME  (completed | no_answer | busy | failed)
 *    • parked on a `branch` step → the semantic DISPOSITION (qualified | callback | dnc | …)
 *  One field suffices for the interpreter because a run parks on exactly one routing step
 *  at a time. (SEE the T1 report: the M2 `completed`→branch chain needs the handler to fold
 *  the DISPOSITION when a connected call routes toward a branch — a T6/T7 concern, flagged.) */
export type WorkflowState = {
  currentStep?: string;
  lastDisposition?: string;
  timezone?: string;
  contactId?: string;
  vars?: Record<string, string>;
};

/** The only event the scheduler emits at V1: the cron tick waking a due run. */
export type WorkflowEvent = { type: "wake" };

/** A guardable side effect the scheduler enqueues as a pg-boss job. Guardrail checks are
 *  NOT here — they run per-action in the executor, so a policy change never re-interprets. */
export type Action =
  | { kind: "place_call"; contactId: string; agentKey: string }
  | {
      kind: "send_wa";
      contactId: string;
      template: string;
      vars: Record<string, string>;
    }
  | { kind: "run_agent_turn"; conversationId: string }
  | { kind: "create_task"; task: Record<string, unknown> }
  | { kind: "write_outcome"; outcome: Record<string, unknown> }
  | { kind: "handoff"; conversationId: string; context: string };

/** The pure interpreter's output — applied atomically by the scheduler in one tx. */
export type Transition = {
  actions: Action[];
  nextStep: string | null;
  wakeAt: Date | null;
  runStatus: RunStatus;
};

/** Result shape the tests read; mirrors zod's SafeParseReturnType at the surface used. */
export type SafeParseResult =
  | { success: true; data: WorkflowDefinition }
  | { success: false; error: unknown };

/** Per-kind step schemas — a CLOSED discriminated union on `kind`; an out-of-set kind fails
 *  safeParse. Fields mirror the `Step` type; unknown keys are stripped, not an error. */
const StepSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("call"),
    agent: z.string(),
    on: z.record(z.string(), z.string()),
  }),
  z.object({ kind: z.literal("wait"), for: z.string(), then: z.string() }),
  z.object({
    kind: z.literal("wait_until"),
    localTime: z.string(),
    then: z.string(),
  }),
  z.object({
    kind: z.literal("whatsapp"),
    template: z.string(),
    then: z.string(),
    vars: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    kind: z.literal("branch"),
    onDisposition: z.record(z.string(), z.string()),
  }),
  z.object({
    kind: z.literal("tool"),
    tool: z.string(),
    args: z.record(z.string(), z.unknown()).optional(),
    then: z.string(),
  }),
  z.object({ kind: z.literal("end") }),
]);

/** The runtime validator for workflows.definition (the JSON in tech-stack T26.2). */
export const WorkflowDefinitionSchema = z.object({
  entry: z.string(),
  steps: z.record(z.string(), StepSchema),
});
