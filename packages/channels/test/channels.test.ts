// T5 RED — packages/channels guarded doorway. MOAT INVARIANT #4: guardrails-as-config gate the
// outbound SEND pipeline; NO code path routes around guard(). This suite pins the doorway that
// voice(Vapi) and whatsapp(Meta) sends pass through: guard() runs BEFORE the sender, a blocking
// verdict prevents the send and is returned, and the real senders sit behind INJECTABLE ports
// (spied here — no live network, no DB).
//
// ENV-FREE by construction: `guard` is a SPY (not the DB-backed harness guard), the senders are
// SPIES, and OrgCtx.db is a no-op the doorway must never touch. Nothing here reaches Postgres or
// the network — the DB-backed guard path lives in the harness policies/loop suites (CI-owned).
//
// NAMESPACE IMPORT (deliberate, mirrors harness/test/policies.test.ts): `voice.place` / `wa.send`
// are NAMESPACE members. A *named* import of a not-yet-exported symbol is a link-time error that
// fails the whole file to load (a spurious import-error RED); a namespace member is simply
// `undefined` until implemented, so the file LOADS and each test REDs on its own call. RED today:
// `voice.place` / `wa.send` are undefined ⇒ "is not a function" at the call site (impl absent).
//
// ORDERING IS UNFAKEABLE (the crown jewel — reviewed line-by-line before any GREEN):
//   (lock 1) BLOCK tests — on a non-ok verdict the sender spy must NOT be called: defeats any impl
//            that sends first / ignores the verdict (incl. Promise.all(guard, send)).
//   (lock 2) IN-GUARD SNAPSHOT — at the instant the guard spy runs, no "send" has happened yet.
//   (lock 3) ORDER LOG equals ["guard","send"] on the ok path.
// All three hold together; no "send-before-guard" code path can pass all of them.
import { describe, expect, it, mock } from "bun:test";
import type { GuardedAction, OrgCtx, Verdict } from "@harness/types";
import type {
  GuardFn,
  SendResult,
  VoicePayload,
  VoiceSender,
  WaPayload,
  WaSender,
} from "../src/types";
import * as voice from "../src/voice";
import * as wa from "../src/whatsapp";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const CONTACT_ID = "22222222-2222-2222-2222-222222222222";
const OK: Verdict = { ok: true };

interface Seen {
  ctx?: OrgCtx;
  action?: GuardedAction;
  sendBeforeGuard?: boolean;
}

/** OrgCtx with a no-op db: the guard-then-send path here never queries (guard is spied), but the
 *  shape is required. orgId rides on ctx — harness GuardedAction has no orgId field, so "+orgId"
 *  (cross-task contract) is asserted here, not on the action. */
function fakeCtx(): OrgCtx {
  return {
    orgId: ORG_ID,
    db: { query: async () => ({ rows: [], rowCount: 0 }) },
  };
}

/** Voice spies: an order log, a capture of what guard saw, and an in-guard snapshot of whether the
 *  sender had already fired. `guard` returns the supplied verdict. */
function voiceRig(verdict: Verdict) {
  const order: string[] = [];
  const seen: Seen = {};
  const sender: VoiceSender = {
    place: mock(async (_p: VoicePayload): Promise<SendResult> => {
      order.push("send");
      return { providerRef: "vapi_call_1" };
    }),
  };
  const guard: GuardFn = mock(async (ctx: OrgCtx, action: GuardedAction) => {
    seen.ctx = ctx;
    seen.action = action;
    seen.sendBeforeGuard = order.includes("send"); // snapshot BEFORE recording "guard"
    order.push("guard");
    return verdict;
  });
  return { order, seen, sender, guard };
}

/** WhatsApp spies — same locks, `send`/WaPayload shape. */
function waRig(verdict: Verdict) {
  const order: string[] = [];
  const seen: Seen = {};
  const sender: WaSender = {
    send: mock(async (_p: WaPayload): Promise<SendResult> => {
      order.push("send");
      return { providerRef: "wamid.1" };
    }),
  };
  const guard: GuardFn = mock(async (ctx: OrgCtx, action: GuardedAction) => {
    seen.ctx = ctx;
    seen.action = action;
    seen.sendBeforeGuard = order.includes("send");
    order.push("guard");
    return verdict;
  });
  return { order, seen, sender, guard };
}

describe("voice doorway (voice.place) — guard before send [moat #4]", () => {
  // AC#1 (ok path) + AC#3 + AC#4: guard runs first, THEN the injected sender; its result returns.
  it("ok verdict: calls guard FIRST, then the sender with the exact payload, and returns its result", async () => {
    const rig = voiceRig(OK);
    const payload: VoicePayload = {
      to: "+919876500000",
      assistantId: "asst_1",
    };
    const res = await voice.place(
      { sender: rig.sender, guard: rig.guard },
      fakeCtx(),
      {
        contactId: CONTACT_ID,
        autonomy: "auto",
        toolName: "place_call",
        payload,
      },
    );
    expect(rig.guard).toHaveBeenCalledTimes(1);
    expect(rig.seen.sendBeforeGuard).toBe(false); // lock 2: sender had NOT fired at guard-time
    expect(rig.order).toEqual(["guard", "send"]); // lock 3: strict order
    expect(rig.sender.place).toHaveBeenCalledTimes(1);
    expect(rig.sender.place).toHaveBeenCalledWith(payload); // AC#3: exact payload
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result).toEqual({ providerRef: "vapi_call_1" }); // AC#4: injected result
  });

  // AC#1 (block path) — MOAT #4: a blocking verdict prevents the send and returns the reason.
  it("blocking verdict (dnc): the sender is NEVER called and the block reason is returned", async () => {
    const rig = voiceRig({ ok: false, reason: "dnc" });
    const res = await voice.place(
      { sender: rig.sender, guard: rig.guard },
      fakeCtx(),
      {
        contactId: CONTACT_ID,
        autonomy: "auto",
        toolName: "place_call",
        payload: { to: "+919876500000" },
      },
    );
    expect(rig.guard).toHaveBeenCalledTimes(1); // guard WAS consulted (not skipped)
    expect(rig.sender.place).not.toHaveBeenCalled(); // lock 1: no send on a block
    expect(rig.order).toEqual(["guard"]); // send never happened
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("dnc"); // doorway returns the reason
  });

  // AC#2: the GuardedAction carries channel:'voice' + contactId (+ tool identity); orgId on ctx.
  it("hands guard an action carrying channel:'voice' + contactId + tool identity; orgId rides on ctx", async () => {
    const rig = voiceRig(OK);
    await voice.place({ sender: rig.sender, guard: rig.guard }, fakeCtx(), {
      contactId: CONTACT_ID,
      autonomy: "auto",
      toolName: "place_call",
      payload: { to: "+919876500000" },
    });
    expect(rig.seen.action).toMatchObject({
      kind: "tool",
      channel: "voice",
      contactId: CONTACT_ID,
      autonomy: "auto",
      toolName: "place_call",
    });
    expect(rig.seen.ctx?.orgId).toBe(ORG_ID); // +orgId travels on OrgCtx
  });
});

describe("whatsapp doorway (wa.send) — guard before send [moat #4]", () => {
  // AC#1 (ok path) + AC#3 + AC#4.
  it("ok verdict: calls guard FIRST, then the sender with the exact payload, and returns its result", async () => {
    const rig = waRig(OK);
    const payload: WaPayload = {
      to: "+919876500000",
      template: "quote_followup",
      vars: { first_name: "Ada" },
    };
    const res = await wa.send(
      { sender: rig.sender, guard: rig.guard },
      fakeCtx(),
      {
        contactId: CONTACT_ID,
        autonomy: "auto",
        toolName: "send_wa",
        payload,
      },
    );
    expect(rig.guard).toHaveBeenCalledTimes(1);
    expect(rig.seen.sendBeforeGuard).toBe(false); // lock 2
    expect(rig.order).toEqual(["guard", "send"]); // lock 3
    expect(rig.sender.send).toHaveBeenCalledTimes(1);
    expect(rig.sender.send).toHaveBeenCalledWith(payload); // AC#3
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result).toEqual({ providerRef: "wamid.1" }); // AC#4
  });

  // AC#1 (block path) — MOAT #4, second reason to prove verdicts flow through generically.
  it("blocking verdict (quiet_hours): the sender is NEVER called and the block reason is returned", async () => {
    const rig = waRig({ ok: false, reason: "quiet_hours" });
    const res = await wa.send(
      { sender: rig.sender, guard: rig.guard },
      fakeCtx(),
      {
        contactId: CONTACT_ID,
        autonomy: "auto",
        toolName: "send_wa",
        payload: {
          to: "+919876500000",
          template: "quote_followup",
          vars: { first_name: "Ada" },
        },
      },
    );
    expect(rig.guard).toHaveBeenCalledTimes(1);
    expect(rig.sender.send).not.toHaveBeenCalled(); // lock 1
    expect(rig.order).toEqual(["guard"]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("quiet_hours");
  });

  // AC#2.
  it("hands guard an action carrying channel:'whatsapp' + contactId + tool identity; orgId rides on ctx", async () => {
    const rig = waRig(OK);
    await wa.send({ sender: rig.sender, guard: rig.guard }, fakeCtx(), {
      contactId: CONTACT_ID,
      autonomy: "auto",
      toolName: "send_wa",
      payload: {
        to: "+919876500000",
        template: "quote_followup",
        vars: { first_name: "Ada" },
      },
    });
    expect(rig.seen.action).toMatchObject({
      kind: "tool",
      channel: "whatsapp",
      contactId: CONTACT_ID,
      autonomy: "auto",
      toolName: "send_wa",
    });
    expect(rig.seen.ctx?.orgId).toBe(ORG_ID);
  });

  // AC#5: template vars reach the sender payload verbatim (T1→T7: send_wa vars must not go out
  // empty). RESPONSIBILITY BOUNDARY: the doorway forwards whatever vars it is given — the
  // contact/run-var MERGE belongs to T7's send_wa handler, not this doorway.
  it("forwards template vars verbatim to the sender payload (non-empty vars must reach the sender)", async () => {
    const rig = waRig(OK);
    const vars = { first_name: "Ada", quote: "2 BHK — 1.2Cr" };
    const payload: WaPayload = {
      to: "+919876500000",
      template: "quote_followup",
      vars,
    };
    await wa.send({ sender: rig.sender, guard: rig.guard }, fakeCtx(), {
      contactId: CONTACT_ID,
      autonomy: "auto",
      toolName: "send_wa",
      payload,
    });
    expect(rig.sender.send).toHaveBeenCalledTimes(1);
    expect(rig.sender.send).toHaveBeenCalledWith(
      expect.objectContaining({ vars }),
    ); // vars intact
    expect(rig.sender.send).toHaveBeenCalledWith(payload); // whole payload forwarded
  });
});
