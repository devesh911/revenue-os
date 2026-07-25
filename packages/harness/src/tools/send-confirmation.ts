// T4 — send_confirmation tool. Outbound sends route through packages/channels guard() (moat
// invariant #4). channels lands in a SIBLING worktree (T5), so send_confirmation depends only
// on an INJECTED port — the seam T5 satisfies. execute() dispatches through deps.send and
// returns its verdict; there is NO other send path. Spec: packages/harness/test/tools.test.ts.
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

// z.guid() over z.uuid() for the same reason as book_appointment (Zod 4 uuid() strictness vs
// test fixtures). channel/body validated BEFORE the port is touched (T11 seatbelt).
const schema = z
  .object({
    contactId: z.guid(),
    channel: z.enum(["whatsapp", "sms", "email"]),
    body: z.string().min(1),
  })
  .strict();

export function makeSendConfirmation(deps: {
  send: SendPort;
}): Tool<z.infer<typeof schema>> {
  return {
    name: "send_confirmation",
    description:
      "Send a booking confirmation via the guarded channels doorway.",
    schema,
    autonomy: "auto",
    async execute(ctx, args) {
      const result = await deps.send(ctx, args);
      return result.ok
        ? { ok: true, data: null }
        : { ok: false, error: "send_failed" };
    },
  };
}
