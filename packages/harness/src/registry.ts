// T26.1 — tool registration + lookup. The runtime capability set for a conversation is
// ALWAYS registry ∩ agents.tools_allowed (S8.1: tools are the security boundary).
// G1: runtime-agnostic.
import { z } from "zod";
import type { Tool, ToolSpec } from "./types";

export class ToolRegistry {
  private tools = new Map<string, Tool<never>>();
  // task-57 — the provider-facing rendering, computed ONCE at registration. A live ZodType
  // JSON.stringifies to {def,type} with no `properties`, so shipping it verbatim shows the model
  // a parameterless tool. Converting at register time makes an unrenderable schema fail at boot,
  // not mid-turn. Tool.schema stays the live instance: it is the T11 runtime seatbelt (loop.ts).
  private wireSchemas = new Map<string, unknown>();

  register<I>(tool: Tool<I>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool as Tool<never>);
    this.wireSchemas.set(tool.name, z.toJSONSchema(tool.schema));
  }

  /** Lookup honoring the allow-list: unknown OR un-allowed → undefined. */
  get(name: string, allowed: readonly string[]): Tool<never> | undefined {
    if (!allowed.includes(name)) return undefined;
    return this.tools.get(name);
  }

  /** Provider-facing specs for the allowed subset only — JSON Schema, never a ZodType. */
  specs(allowed: readonly string[]): ToolSpec[] {
    return [...this.tools.values()]
      .filter((t) => allowed.includes(t.name))
      .map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: this.wireSchemas.get(t.name),
      }));
  }
}
