// The tracker's parser (docs/tracker/parse.js) reads the slice field a passing proof run's date and link go in as
// `Proof passed:`, reports the old name `Seen by Devesh:` as renamed, and refuses a done slice without a date there
// or with an unticked item. The banner's use of the field is in cycle-proof.test.ts.
import { describe, expect, it } from "bun:test";
import { parseRoadmap } from "../docs/tracker/parse.js";

const URL0 = "https://github.com/devesh911/revenue-os/actions/runs/555";
function slice(n: number, status: string, passed = "—") {
  return `## Slice ${n}: Title ${n}\nStatus: ${status}\nGoal: g\nProof: p\nBlocked by: nothing\nProof passed: ${passed}\n\n- [x] A (agent) · evidence: [#1](https://example.com)\n`;
}

describe("the field a passing proof run is written in", () => {
  // behaviour already on main: main's copy carries the tracker's parser, docs/tracker/parse.js, over (it is not product code), so it passes there
  it("is `Proof passed:`; a done slice needs its date there, and the old name is reported as renamed", () => {
    const ok = parseRoadmap(
      `# Roadmap\n\n${slice(0, "done", `2026-10-05 · [run 555](${URL0})`)}`,
    );
    expect(ok.problems).toEqual([]);
    expect(ok.slices[0]?.["Proof passed"]).toBe(
      `2026-10-05 · [run 555](${URL0})`,
    );
    expect(parseRoadmap(`# Roadmap\n\n${slice(0, "done")}`).problems).toEqual([
      'Slice 0 says done but "Proof passed" has no date',
    ]);
    expect(
      parseRoadmap(
        `# Roadmap\n\n${slice(0, "in progress").replace("Proof passed:", "Seen by Devesh:")}`,
      ).problems,
    ).toEqual([
      'Slice 0: the field "Seen by Devesh:" is now "Proof passed:"',
      'Slice 0 is missing its "Proof passed:" line',
    ]);
  });

  // behaviour already on main: main's copy carries the tracker's parser, docs/tracker/parse.js, over (it is not product code), so it passes there
  it("is never on a slice with an unticked item: the parser reports a done slice that has one", () => {
    const md = `# Roadmap\n\n${slice(0, "done", `2026-10-05 · [run 555](${URL0})`)}- [ ] B, never proved (agent)\n`;
    expect(parseRoadmap(md).problems).toEqual([
      expect.stringContaining("Slice 0 says done but 1 item is not ticked"),
    ]);
  });
});
