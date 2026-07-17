import { describe, expect, it, mock } from "bun:test";

describe("probe", () => {
  it("P1: import.meta.env.VITE_SUPABASE_URL value", () => {
    console.log("PROBE url=", JSON.stringify(import.meta.env.VITE_SUPABASE_URL));
    console.log("PROBE anon=", JSON.stringify(import.meta.env.VITE_SUPABASE_ANON_KEY));
    expect(true).toBe(true);
  });

  it("P2: real createClient(undefined,undefined) throws?", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    let threw = "no-throw";
    try {
      createClient(
        undefined as unknown as string,
        undefined as unknown as string,
      );
    } catch (e) {
      threw = `THREW: ${(e as Error).message}`;
    }
    console.log("PROBE createClient-undefined:", threw);
    expect(true).toBe(true);
  });

  it("P3: importing CURRENT lib/supabase.ts throws at module scope?", async () => {
    let outcome = "imported-ok";
    try {
      await import("../apps/console/src/lib/supabase");
    } catch (e) {
      outcome = `IMPORT-THREW: ${(e as Error).message}`;
    }
    console.log("PROBE import-supabase:", outcome);
    expect(true).toBe(true);
  });

  it("P4: mock.module updates already-evaluated importer live binding?", async () => {
    // consumer already imported real @supabase/supabase-js above (P2/P3). Now mock it.
    const fake = { auth: { tag: "MOCK" } };
    const createClient = mock(() => fake);
    mock.module("@supabase/supabase-js", () => ({ createClient }));
    const sb = await import("@supabase/supabase-js");
    console.log(
      "PROBE mock-visible-directly:",
      sb.createClient === createClient ? "YES" : "NO",
    );
    expect(true).toBe(true);
  });
});
