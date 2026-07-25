// T1 (T26.2) — the pure workflow interpreter.
//
//   interpret(definition, runState, event, now) → Transition
//
// PURE by contract (test 9): deterministic in its four inputs, performs ZERO I/O, and never
// reads the clock — callers pass `now` explicitly. No db/ctx handle is in the signature, so
// durability lives entirely in the tables, never in the interpreter.
//
// RED STUB authored by the tester: returns a fixed placeholder so the interpret tests fail on
// assertion diffs against a missing implementation. The worker replaces the body (only) with
// the real interpreter; the encoded contract is test/interpret.test.ts. G1: runtime-agnostic.
import type {
  Transition,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowState,
} from "./schema";

export function interpret(
  _def: WorkflowDefinition,
  _state: WorkflowState,
  _event: WorkflowEvent,
  _now: Date,
): Transition {
  // RED placeholder — deliberately inert so every interpret assertion below fails.
  return { actions: [], nextStep: null, wakeAt: null, runStatus: "pending" };
}
