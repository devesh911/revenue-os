// T3 RED — tester STUB ONLY (no implementation). This placeholder exists so that
// packages/harness/test/anthropic.test.ts can import `createAnthropicProvider` and fail on its
// ASSERTIONS (not on a module-resolution error), and so the `export { createAnthropicProvider }`
// re-export added to ./index.ts typechecks (packages/*/src/** is in tsconfig scope).
// The worker REPLACES this entire body with the real raw-`fetch` adapter — docs/tech-stack.md
// T19: "raw fetch, no SDK" (no @anthropic-ai dependency). Doing NO fetch and returning an empty
// turn here makes every behavioral test in anthropic.test.ts RED by construction.
// G1: runtime-agnostic — no bun:* imports, no Bun.* globals.
import type { LlmProvider } from "../types";

export function createAnthropicProvider(_config: {
  apiKey: string;
  model: string;
}): LlmProvider {
  return {
    complete: () => Promise.resolve({ usage: { in: 0, out: 0 } }),
  };
}
