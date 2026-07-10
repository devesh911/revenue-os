// T26.1 — emit(usage_events): called by every priced action. Metering is live from P1
// (project-spec §8 cost guardrail); cost mapping refines later, quantity is truth now.
// G1: runtime-agnostic.
import type { OrgCtx } from "./types";

export async function emitUsage(
  ctx: OrgCtx,
  event: {
    conversationId?: string;
    kind: "llm" | "stt" | "tts" | "telephony" | "wa_message" | "embedding";
    provider: string;
    quantity: number;
    unit: string;
    costUsd?: number;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.db.query(
    `insert into usage_events (org_id, conversation_id, kind, provider, quantity, unit, cost_usd, meta)
		 values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ctx.orgId,
      event.conversationId ?? null,
      event.kind,
      event.provider,
      event.quantity,
      event.unit,
      event.costUsd ?? 0,
      JSON.stringify(event.meta ?? {}),
    ],
  );
}
