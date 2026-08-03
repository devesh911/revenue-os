// task-59 RED — criterion 3 (seam level): the eval-mode SendPort RECORDS sends instead of
// delivering them. Pure, no DB: proves the runner ships a capture port with no outbound side
// effect. The integration side (a scenario whose agent sends → a captured record) lives in
// eval-runner.test.ts.
import { describe, expect, it } from "bun:test";
import type { OrgCtx } from "@revenue-os/harness";
import { createCaptureSend } from "./eval-runner";

const ctx = {
  orgId: "00000000-0000-0000-0000-000000000000",
} as unknown as OrgCtx;

describe("createCaptureSend (criterion 3)", () => {
  it("returns { ok: true } without delivering, and records each send", async () => {
    const { send, captured } = createCaptureSend();

    const r = await send(ctx, {
      contactId: "11111111-1111-1111-1111-111111111111",
      channel: "whatsapp",
      body: "hello",
    });

    expect(r.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].msg.body).toBe("hello");
    expect(captured[0].msg.channel).toBe("whatsapp");
  });

  it("accumulates multiple sends in order", async () => {
    const { send, captured } = createCaptureSend();
    await send(ctx, {
      contactId: "11111111-1111-1111-1111-111111111111",
      channel: "sms",
      body: "one",
    });
    await send(ctx, {
      contactId: "11111111-1111-1111-1111-111111111111",
      channel: "email",
      body: "two",
    });
    expect(captured.map((c) => c.msg.body)).toEqual(["one", "two"]);
  });
});
