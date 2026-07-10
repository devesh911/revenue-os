// T26.1 — every shared type lives here, nowhere else.
// G1: runtime-agnostic.
import type { z } from "zod";

/** Structural view of packages/db's tx client — the ONLY door to data (T26.1). */
export interface OrgScopedDb {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export type OrgCtx = { orgId: string; db: OrgScopedDb };

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export type Autonomy = "auto" | "approval" | "forbidden";

export interface Tool<I = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<I>; // args validated BEFORE anything runs (T11 seatbelt)
  autonomy: Autonomy; // default; org guardrail_policies may tighten, never loosen
  execute(ctx: OrgCtx, args: I): Promise<ToolResult>;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: unknown; // provider-facing JSON schema (adapter-specific rendering)
}

export interface Msg {
  role: "agent" | "contact" | "human_agent" | "system" | "tool";
  content: string;
}

export type LlmTurn = {
  text?: string;
  toolCalls?: { name: string; args: unknown }[];
  usage: { in: number; out: number };
};

export interface LlmProvider {
  complete(req: {
    system: string;
    messages: Msg[];
    tools?: ToolSpec[];
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<LlmTurn>;
}

export type Verdict =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "dnc"
        | "quiet_hours"
        | "attempt_cap"
        | "approval_required"
        | "spend_cap"
        | "forbidden";
    };

/** A guardable action — the policy pipeline sees these, never raw tool internals. */
export interface GuardedAction {
  kind: "tool";
  toolName: string;
  autonomy: Autonomy;
  contactId?: string;
  channel?: "voice" | "whatsapp" | "sms" | "email";
}

/** A policy hook returns a failing Verdict to block, or null to pass to the next hook. */
export type PolicyHook = (
  ctx: OrgCtx,
  action: GuardedAction,
) => Promise<Verdict | null>;
