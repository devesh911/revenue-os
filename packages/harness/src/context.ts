// T26.1/T26.6 — prompt assembly. Skeleton: system prompt + transcript tail by seq.
// KB + memory retrieval (retrieval.ts) joins here in P2 with the labeled data blocks (S8.4)
// and the token budget (system ≤1.5k · KB ≤2k · memories ≤800 · tail ≤3k · tools ≤600).
// T7 Feed-1: an optional workflow context prepends a "why I'm calling" block (additive — the
// base system prompt is preserved, never replaced) so a driven turn knows its workflow goal.
// G1: runtime-agnostic.
import type { Msg, OrgCtx } from "./types";
import type { WorkflowState } from "./workflow/schema";

const TRANSCRIPT_TAIL = 50;

/** Feed-1: the "why I'm calling" block, built from the run's current step + state (passed in,
 *  never queried). Additive — it goes ABOVE the base prompt; the base prompt stays verbatim. */
function whyBlock(workflow: {
  currentStep: string;
  state: WorkflowState;
}): string {
  const lines = [
    "# Why I'm reaching out",
    `You are running workflow step "${workflow.currentStep}". Stay on this goal.`,
  ];
  const vars = workflow.state.vars;
  if (vars && Object.keys(vars).length > 0) {
    lines.push(
      `Known context: ${Object.entries(vars)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}.`,
    );
  }
  if (workflow.state.lastDisposition) {
    lines.push(
      `Last outcome on this contact: ${workflow.state.lastDisposition}.`,
    );
  }
  return lines.join("\n");
}

export async function assembleContext(
  ctx: OrgCtx,
  conversationId: string,
  systemPrompt: string,
  workflow?: { currentStep: string; state: WorkflowState },
): Promise<{ system: string; messages: Msg[] }> {
  const r = await ctx.db.query(
    `select role, content from (
		   select role, content, seq from messages
		   where conversation_id = $1 order by seq desc limit $2
		 ) tail order by seq asc`,
    [conversationId, TRANSCRIPT_TAIL],
  );
  const system = workflow
    ? `${whyBlock(workflow)}\n\n${systemPrompt}`
    : systemPrompt;
  return {
    system,
    messages: r.rows.map((m) => ({
      role: m.role as Msg["role"],
      content: (m.content as string) ?? "",
    })),
  };
}
