// T26.1/T26.6 — prompt assembly. Skeleton: system prompt + transcript tail by seq.
// KB + memory retrieval (retrieval.ts) joins here in P2 with the labeled data blocks (S8.4)
// and the token budget (system ≤1.5k · KB ≤2k · memories ≤800 · tail ≤3k · tools ≤600).
// G1: runtime-agnostic.
import type { Msg, OrgCtx } from "./types";

const TRANSCRIPT_TAIL = 50;

export async function assembleContext(
  ctx: OrgCtx,
  conversationId: string,
  systemPrompt: string,
): Promise<{ system: string; messages: Msg[] }> {
  const r = await ctx.db.query(
    `select role, content from (
		   select role, content, seq from messages
		   where conversation_id = $1 order by seq desc limit $2
		 ) tail order by seq asc`,
    [conversationId, TRANSCRIPT_TAIL],
  );
  return {
    system: systemPrompt,
    messages: r.rows.map((m) => ({
      role: m.role as Msg["role"],
      content: (m.content as string) ?? "",
    })),
  };
}
