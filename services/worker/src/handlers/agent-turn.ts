// T7 (task-47) — run_agent_turn job handler: the generic bridge to the harness turn loop.
// RED-phase THROWING STUB (no implementation). GREEN wires, in ONE withOrg(orgId) tx:
//   1. reload the conversation; NO-OP if this trigger was already processed (idempotent against a
//      pg-boss re-delivery — the same job runs the turn ONCE, not twice).
//   2. load the conversation's agent (system_prompt + tools_allowed) and invoke
//      runTurn({ provider, registry, toolsAllowed, systemPrompt }, ctx, conversationId) so
//      messages + usage_events land.

import type { ToolRegistry } from "@harness/registry";
import type { LlmProvider } from "@harness/types";
import type { Pool } from "pg";

export type AgentTurnDeps = {
  pool: Pool;
  provider: LlmProvider;
  registry: ToolRegistry;
  now?: () => Date;
};

export type AgentTurnJob = {
  orgId: string;
  runId: string;
  action: { kind: "run_agent_turn"; conversationId: string };
};

export async function handleAgentTurn(
  _deps: AgentTurnDeps,
  _job: AgentTurnJob,
): Promise<void> {
  throw new Error("T7 not implemented: agent_turn handler");
}
