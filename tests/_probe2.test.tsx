import { describe, expect, it, mock } from "bun:test";

describe("probe2 — does mock.module reach apps/console supabase.ts?", () => {
  it("mock BEFORE first import of supabase.ts", async () => {
    const fake = { auth: { tag: "MOCK" } };
    const createClient = mock(() => fake);
    mock.module("@supabase/supabase-js", () => ({ createClient }));

    let outcome: string;
    try {
      const mod = await import("../apps/console/src/lib/supabase");
      outcome = `imported-ok; keys=${JSON.stringify(Object.keys(mod))}; createClient-calls=${createClient.mock.calls.length}`;
    } catch (e) {
      outcome = `IMPORT-THREW: ${(e as Error).message}`;
    }
    console.log("PROBE2:", outcome);
    expect(true).toBe(true);
  });
});
