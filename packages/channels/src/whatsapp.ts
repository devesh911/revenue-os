// T5 — whatsapp(Meta) guarded doorway. WORKER (GREEN) fills this:
//   export async function send(ports: WaPorts, ctx: OrgCtx, req: WaReq): Promise<DoorwayResult>
//   MUST: build action {kind:'tool', toolName, autonomy, contactId, channel:'whatsapp'} → await
//   ports.guard(ctx, action) FIRST → if !verdict.ok return verdict (NO send) → only then
//   await ports.sender.send(req.payload) and return {ok:true, result}. Forward req.payload.vars
//   verbatim (T7 owns the contact/run-var MERGE, not this doorway).
// RED: `send` is intentionally NOT exported yet — test namespace-imports it and REDs on
// "wa.send is not a function". G1: runtime-agnostic.
export {};
