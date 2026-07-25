// T4 — send_confirmation tool. RED-phase STUB (no implementation).
// Outbound sends must route through packages/channels guard() (moat invariant #4). channels
// lands in a SIBLING worktree (T5), so send_confirmation depends only on an INJECTED port —
// the seam T5 satisfies. GREEN (worker): schema validates args; execute() dispatches through
// deps.send (never a direct/HTTP path). Spec: packages/harness/test/tools.test.ts.
// G1: runtime-agnostic.
import { z } from "zod";
import type { OrgCtx, Tool } from "../types";

/** The confirmation payload handed to the guarded channels doorway. */
export type ConfirmationMessage = {
  contactId: string;
  channel: "whatsapp" | "sms" | "email";
  body: string;
};

/** Result of a guarded send. T5's channels.send is assignable to this shape. */
export type SendResult = { ok: boolean };

/** The send seam: the ONLY outbound path send_confirmation may use (T5 provides the adapter). */
export type SendPort = (
  ctx: OrgCtx,
  msg: ConfirmationMessage,
) => Promise<SendResult>;

export function makeSendConfirmation(_deps: { send: SendPort }): Tool {
  return {
    name: "send_confirmation",
    description:
      "Send a booking confirmation via the guarded channels doorway.",
    schema: z.unknown(), // STUB: GREEN supplies the validating schema
    autonomy: "auto",
    // STUB: GREEN dispatches through _deps.send; the stub deliberately does NOT.
    execute: async () => ({ ok: false as const, error: "not_implemented" }),
  };
}
