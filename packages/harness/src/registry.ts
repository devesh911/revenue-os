// T26.1 — tool registration + lookup. The runtime capability set for a conversation is
// ALWAYS registry ∩ agents.tools_allowed (S8.1: tools are the security boundary).
// G1: runtime-agnostic.
import type { Tool, ToolSpec } from "./types";

export class ToolRegistry {
  private tools = new Map<string, Tool<never>>();

  register<I>(tool: Tool<I>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool as Tool<never>);
  }

  /** Lookup honoring the allow-list: unknown OR un-allowed → undefined. */
  get(name: string, allowed: readonly string[]): Tool<never> | undefined {
    if (!allowed.includes(name)) return undefined;
    return this.tools.get(name);
  }

  /** Provider-facing specs for the allowed subset only. */
  specs(allowed: readonly string[]): ToolSpec[] {
    return [...this.tools.values()]
      .filter((t) => allowed.includes(t.name))
      .map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.schema,
      }));
  }
}
