// voice(vapi) + whatsapp(meta) behind ONE interface; every send passes guard() BEFORE the sender
// (moat invariant #4 — no code path around it). Public API: `voice.place(...)` / `wa.send(...)`.
// G1: runtime-agnostic — no bun:* imports, no Bun globals in this package.

export type * from "./types";
export * as voice from "./voice";
export * as wa from "./whatsapp";
