// T7 (task-47) criterion 5 — assembleContext Feed-1: the "why I'm calling" workflow block.
// ENV-FREE UNIT (pure over a stubbed ctx.db — no Postgres): the block is built from the run's
// current_step + state (PASSED IN), not queried. The T7 signature gains a 4th arg:
//   assembleContext(ctx, conversationId, systemPrompt, workflow?: { currentStep, state })
// RED: the current 3-arg impl ignores the 4th arg and returns system === systemPrompt, so the
// "block is present" assertions FAIL at runtime (bun does not type-check the extra arg away).
import { describe, expect, it } from "bun:test";
import { assembleContext } from "../src/context";
import type { OrgCtx } from "../src/types";

/** A stubbed org-scoped db: returns the given rows for the transcript-tail query; no real PG. */
function stubCtx(rows: { role: string; content: string }[]): OrgCtx {
  return {
    orgId: "00000000-0000-0000-0000-000000000000",
    db: {
      query: async () => ({
        rows: rows as Record<string, unknown>[],
        rowCount: rows.length,
      }),
    },
  };
}

const BASE = "You are Asha, a friendly site-visit scheduler.";
const CONV = "11111111-1111-1111-1111-111111111111";
const TAIL = [
  { role: "contact", content: "Hi, who is this?" },
  { role: "agent", content: "This is Asha from Prestige." },
];

describe("assembleContext Feed-1 — the 'why I'm calling' workflow block (T7)", () => {
  it("injects a why-I'm-calling block from the run's current_step + state [criterion 5]", async () => {
    const ctx = stubCtx(TAIL);
    // 4th arg = the workflow context the scheduler/handler hands the turn.
    const result = await assembleContext(ctx, CONV, BASE, {
      currentStep: "qualify_and_book",
      state: {
        contactId: "c1",
        vars: { project: "Prestige Lakeside" },
        lastDisposition: "no_answer",
      },
    });

    // the base system prompt is preserved — the block is ADDITIVE (a superset), never a replace
    expect(result.system).toContain(BASE);
    // the block references the run's current step (the "why I'm calling" goal is built from it)
    expect(result.system).toContain("qualify_and_book");
    // and something was actually added (guards a no-op that just returns the base prompt)
    expect(result.system.length).toBeGreaterThan(BASE.length);
    // the transcript tail still assembles from ctx.db, in seq order
    expect(result.messages.map((m) => m.content)).toEqual([
      "Hi, who is this?",
      "This is Asha from Prestige.",
    ]);
  });

  it("without workflow context the system prompt is unchanged (additive / back-compat) [criterion 5]", async () => {
    // Back-compat GUARD (expected to hold against the current impl too): the 4th arg is optional
    // and its absence leaves the existing behavior — bare system prompt + transcript tail — intact.
    const ctx = stubCtx(TAIL);
    const result = await assembleContext(ctx, CONV, BASE);
    expect(result.system).toBe(BASE);
    expect(result.messages.length).toBe(2);
  });
});
