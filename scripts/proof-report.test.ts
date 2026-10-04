// A slice's short proof report (scripts/proof/report.ts): report.md, what `bun run proof` prints, and the comment the
// proof workflow posts to the "Proof reports" issue.
import { describe, expect, it, setDefaultTimeout } from "bun:test";
import { reportHeading } from "./done-gate/proof-run";
import { reportText } from "./proof/report";

setDefaultTimeout(30_000);
const KEY = "A second Anthropic key for the automatic test conversations";

describe("the report", () => {
  it("opens with the heading rules-from-main looks for, then the run, then each step with what it saw", () => {
    const text = reportText(
      0,
      [
        {
          does: "checks A",
          outcome: "passed",
          seen: "A is there",
          files: ["1-a.png"],
        },
        {
          does: "checks B",
          outcome: "waiting",
          seen: `waits on Devesh: "${KEY}"`,
          files: [],
        },
      ],
      {
        run: "https://github.com/o/r/actions/runs/1",
        commit: "abcdef0123",
        date: "2026-10-05",
      },
    );
    const lines = text.split("\n");
    expect(lines[0]).toBe(reportHeading(0, "waiting"));
    expect(lines[1]).toBe(
      "Run: https://github.com/o/r/actions/runs/1 · commit abcdef0 · 2026-10-05",
    );
    expect(text).toContain("1. ✓ passed: checks A");
    expect(text).toContain("Seen: A is there");
    expect(text).toContain("1-a.png");
    expect(text).toContain("2. … waiting: checks B");
    expect(text).toContain("stay as they are");
  });

  it("fits in one GitHub comment however long and many-lined the steps' texts are", () => {
    const long = `${"a line of output\n".repeat(400)}`;
    const text = reportText(
      0,
      Array.from({ length: 40 }, () => ({
        does: "x".repeat(5000),
        outcome: "failed" as const,
        seen: long,
        files: [],
      })),
      { commit: "abcdef0", date: "2026-10-05" },
    );
    expect(text.length).toBeLessThanOrEqual(65_536);
    expect(text.split("\n")[0]).toBe(reportHeading(0, "failed"));
  });
});
