// T5 — voice(Vapi) guarded doorway. WORKER (GREEN) fills this:
//   export async function place(ports: VoicePorts, ctx: OrgCtx, req: VoiceReq): Promise<DoorwayResult>
//   MUST: build action {kind:'tool', toolName, autonomy, contactId, channel:'voice'} → await
//   ports.guard(ctx, action) FIRST → if !verdict.ok return verdict (NO send) → only then
//   await ports.sender.place(req.payload) and return {ok:true, result}.
// RED: `place` is intentionally NOT exported yet — test namespace-imports it and REDs on
// "voice.place is not a function". G1: runtime-agnostic.
export {};
