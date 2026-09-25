// AC-C2 follow-up to session-rules.test.ts (the RED suite stays as reviewed): dot segments that
// collapse to a "//host" path are protocol-relative — another site — so safeNext refuses them too.
import { describe, expect, it } from "bun:test";
import { safeNext } from "../src/app/session/safe-next";

describe("safeNext — dot segments that collapse to //host (AC-C2)", () => {
  for (const raw of [
    "/.//evil.com",
    "/%2e//evil.com",
    "/a/..//evil.com",
    "/./\\evil.com",
  ])
    it(`AC-C2: ${JSON.stringify(raw)} falls back to /`, () => {
      expect(safeNext(raw)).toBe("/");
    });

  it("AC-C2: an ordinary deep link still comes back intact", () => {
    expect(safeNext("/o/x/./home?y=1#z")).toBe("/o/x/home?y=1#z");
  });
});
