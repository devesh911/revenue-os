// T26: loop.ts, context.ts, registry, policies (guard pipeline), llm/, audit, meter
// G1: runtime-agnostic — no bun:* imports, no Bun globals in this package.
export { emitAudit } from "./audit";
export { assembleContext } from "./context";
// T8-H2: createAnthropicProvider + buildCatalog re-exported from the barrel so consumers
// (services/worker/src/jobs.ts, the T9 replay) import from "@revenue-os/harness" — never a
// "@revenue-os/harness/src/…" subpath. Additive.
export {
  createAnthropicProvider,
  registerProvider,
  selectProvider,
} from "./llm";
export { runTurn, type TurnDeps } from "./loop";
export { emitUsage } from "./meter";
export { autonomyHook, defaultPipeline, guard } from "./policies";
export { ToolRegistry } from "./registry";
export { buildCatalog, type SendPort } from "./tools";
export type * from "./types";
export { interpret } from "./workflow/interpret";
export type * from "./workflow/schema";
export { WorkflowDefinitionSchema } from "./workflow/schema";
