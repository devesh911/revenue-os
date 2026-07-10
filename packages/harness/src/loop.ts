// T26.5 — the async turn loop, exactly as specified:
//   assembleContext → provider.complete → meter → zod-parse args → guard() → execute → audit
//   → append tool result rows → repeat ≤ MAX_TOOL_ROUNDS → persist closing assistant message.
// Stateless: every effect is a row; a crash mid-turn loses nothing that matters.
// G1: runtime-agnostic.

import { emitAudit } from "./audit";
import { assembleContext } from "./context";
import { emitUsage } from "./meter";
import { guard } from "./policies";
import type { ToolRegistry } from "./registry";
import type { LlmProvider, OrgCtx, PolicyHook, ToolResult } from "./types";

const MAX_TOOL_ROUNDS = 5;

export interface TurnDeps {
  provider: LlmProvider;
  registry: ToolRegistry;
  toolsAllowed: readonly string[]; // agents.tools_allowed — S8.1 capability boundary
  systemPrompt: string;
  pipeline?: PolicyHook[];
  providerName?: string;
}

async function nextSeq(ctx: OrgCtx, conversationId: string): Promise<number> {
  const r = await ctx.db.query(
    `select coalesce(max(seq), 0) + 1 as seq from messages where conversation_id = $1`,
    [conversationId],
  );
  return Number(r.rows[0]?.seq ?? 1);
}

async function appendMessage(
  ctx: OrgCtx,
  conversationId: string,
  row: { role: "agent" | "tool"; content?: string; toolCall?: unknown },
): Promise<void> {
  const seq = await nextSeq(ctx, conversationId);
  await ctx.db.query(
    `insert into messages (org_id, conversation_id, seq, role, content, tool_call)
		 values ($1, $2, $3, $4, $5, $6)`,
    [
      ctx.orgId,
      conversationId,
      seq,
      row.role,
      row.content ?? null,
      row.toolCall === undefined ? null : JSON.stringify(row.toolCall),
    ],
  );
}

export async function runTurn(
  deps: TurnDeps,
  ctx: OrgCtx,
  conversationId: string,
): Promise<void> {
  const providerName = deps.providerName ?? "fake";

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
    const input = await assembleContext(ctx, conversationId, deps.systemPrompt);
    const turn = await deps.provider.complete({
      system: input.system,
      messages: input.messages,
      tools: deps.registry.specs(deps.toolsAllowed),
    });
    await emitUsage(ctx, {
      conversationId,
      kind: "llm",
      provider: providerName,
      quantity: turn.usage.in + turn.usage.out,
      unit: "tokens",
      meta: { in: turn.usage.in, out: turn.usage.out, round },
    });

    if (!turn.toolCalls || turn.toolCalls.length === 0) {
      if (turn.text)
        await appendMessage(ctx, conversationId, {
          role: "agent",
          content: turn.text,
        });
      return;
    }

    for (const call of turn.toolCalls) {
      const tool = deps.registry.get(call.name, deps.toolsAllowed);
      if (!tool) {
        await appendMessage(ctx, conversationId, {
          role: "tool",
          toolCall: {
            name: call.name,
            result: { ok: false, error: "unknown_or_unallowed_tool" },
          },
        });
        continue;
      }

      const parsed = tool.schema.safeParse(call.args);
      if (!parsed.success) {
        // hallucination seatbelt (T11): invalid args never reach execute()
        await appendMessage(ctx, conversationId, {
          role: "tool",
          toolCall: {
            name: call.name,
            result: { ok: false, error: "invalid_args" },
          },
        });
        continue;
      }

      const verdict = await guard(
        ctx,
        { kind: "tool", toolName: tool.name, autonomy: tool.autonomy },
        deps.pipeline,
      );

      let result: ToolResult;
      if (verdict.ok) {
        result = await tool.execute(ctx, parsed.data as never);
        await emitAudit(ctx, {
          actorType: "agent",
          action: `tool.${tool.name}`,
          resourceType: "conversation",
          resourceId: conversationId,
          meta: { round, ok: result.ok },
        });
      } else if (verdict.reason === "approval_required") {
        // T26.5: approval-gated → a human task, never a silent drop
        await ctx.db.query(
          `insert into tasks (org_id, conversation_id, kind, title, payload)
					 values ($1, $2, 'approval', $3, $4)`,
          [
            ctx.orgId,
            conversationId,
            `Approve: ${tool.name}`,
            JSON.stringify({ tool: tool.name, args: parsed.data }),
          ],
        );
        result = { ok: false, error: "approval_required" };
      } else {
        result = { ok: false, error: verdict.reason };
      }

      await appendMessage(ctx, conversationId, {
        role: "tool",
        toolCall: { name: tool.name, args: parsed.data, result },
      });
    }
  }
}
