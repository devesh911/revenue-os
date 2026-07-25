// T5 — whatsapp(Meta) guarded doorway. MOAT #4: guard() runs BEFORE the sender on every path; a
// blocking verdict returns the reason and NO send happens. Senders + guard are injected via ports.
// req.payload.vars are FORWARDED verbatim — the contact/run-var MERGE is T7's send_wa handler.
// Harness types are type-only (tsconfig @harness/* alias, erased at runtime — no runtime harness dep).
// G1: runtime-agnostic — no bun:* imports, no Bun globals.
import type { GuardedAction, OrgCtx } from "@harness/types";
import type { DoorwayResult, WaPorts, WaReq } from "./types";

export async function send(
  ports: WaPorts,
  ctx: OrgCtx,
  req: WaReq,
): Promise<DoorwayResult> {
  const action: GuardedAction = {
    kind: "tool",
    toolName: req.toolName,
    autonomy: req.autonomy,
    contactId: req.contactId,
    channel: "whatsapp",
  };
  const verdict = await ports.guard(ctx, action); // 1. guard FIRST, always
  if (!verdict.ok) return verdict; // 2. block → return the reason, NO send
  const result = await ports.sender.send(req.payload); // 3. only-then send
  return { ok: true, result };
}
