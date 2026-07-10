// T26.1 llm/ — provider adapters behind ONE interface, selected by config string
// ("anthropic:fast" · "anthropic:mid"). Real adapters (raw fetch per T19) land with P1's
// talking demo; the interface is the contract the loop is tested against (fake in tests).
// G1: runtime-agnostic.
import type { LlmProvider } from "../types";

const providers = new Map<string, LlmProvider>();

export function registerProvider(key: string, provider: LlmProvider): void {
  providers.set(key, provider);
}

export function selectProvider(key: string): LlmProvider {
  const p = providers.get(key);
  if (!p)
    throw new Error(
      `no LLM provider registered for '${key}' (register at app startup)`,
    );
  return p;
}
