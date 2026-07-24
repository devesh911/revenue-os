// task-28 ui-foundation-v2 · A1-RED — barrel + contract spec.
// (1) The two new primitives (and the Table sub-parts consumers compose) must be exported from
//     ui/primitives/index.ts — the barrel is the ONLY import surface for pages ("pages import
//     from here, never from individual files"), so THead/TH/Row/TD have to be reachable too.
// (2) ui/README.md — the design-system contract — must document both new primitives.
// Env-free by construction (bun test; a namespace import + Bun.file text read, no DB/network).
import { describe, expect, it } from "bun:test";
import * as primitives from "../src/ui/primitives";

const P = primitives as unknown as Record<string, unknown>;

describe("ui/primitives barrel exports the new suite", () => {
  it("exports DataShell and the full Table suite (Table, THead, TH, Row, TD)", () => {
    for (const name of ["DataShell", "Table", "THead", "TH", "Row", "TD"]) {
      expect(typeof P[name]).toBe("function");
    }
  });
});

describe("ui/README.md documents the new primitives", () => {
  it("mentions DataShell and Table (the Table primitive, not screens/ContactsTable)", async () => {
    const readme = await Bun.file("apps/console/src/ui/README.md").text();
    expect(readme).toContain("DataShell");
    // \bTable\b matches the documented primitive (e.g. "**Table**") but NOT "ContactsTable"
    // (no word boundary before "Table") and NOT the lowercase "<table …/>" prose.
    expect(readme).toMatch(/\bTable\b/);
  });
});
