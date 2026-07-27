// T7 (task-47) — send_wa job handler. RED-phase THROWING STUB (no implementation).
// GREEN wires, in ONE withOrg(orgId) tx:
//   1. reload the run; NO-OP if this send was already delivered (the scheduler ALREADY advanced
//      the run past the whatsapp step, so staleness is a DURABLE send marker keyed by a
//      deterministic fn of the job payload — e.g. a wa_message usage row / a whatsapp
//      conversation upsert — NOT the run step). Exactly-once against a re-delivery.
//   2. guard() BEFORE the send (moat #4) via the channels wa doorway (wa.send, injected sender
//      + guard). A blocking verdict => NO send.
//   3. MERGE the run/contact vars into the template vars (the T5->T7 contract: send_wa must not
//      go out empty) and send; record the outbound message + usage.
import type { GuardedAction, OrgCtx, Verdict } from "@harness/types";
import type { Pool } from "pg";

/** WhatsApp sender port — structural superset of channels' WaSender (local, no channels dep). */
export type WaSenderPort = {
  send(payload: {
    to: string;
    template: string;
    vars: Record<string, string>;
  }): Promise<{ providerRef: string }>;
};

export type WaGuardPort = (
  ctx: OrgCtx,
  action: GuardedAction,
) => Promise<Verdict>;

export type SendWaDeps = {
  pool: Pool;
  guard: WaGuardPort;
  sender: WaSenderPort;
  now?: () => Date;
};

export type SendWaJob = {
  orgId: string;
  runId: string;
  action: {
    kind: "send_wa";
    contactId: string;
    template: string;
    vars: Record<string, string>;
  };
};

export async function handleSendWa(
  _deps: SendWaDeps,
  _job: SendWaJob,
): Promise<void> {
  throw new Error("T7 not implemented: send_wa handler");
}
