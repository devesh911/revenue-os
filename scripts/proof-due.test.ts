// Which slices a run of the proof workflow proves (scripts/proof/due.ts): the one given by hand, whatever its status,
// or else every slice ROADMAP.md marks `proof ready` or `done`.
import { describe, expect, it, setDefaultTimeout } from "bun:test";
import { dueSlices } from "./proof/due";

setDefaultTimeout(30_000);

describe("which slices a proof run proves", () => {
  const roadmap = (statuses: string[]) =>
    `# Roadmap\n\n${statuses.map((s, n) => `## Slice ${n}: T\nStatus: ${s}\nGoal: g\nProof: p\nBlocked by: nothing\nProof passed: ${s === "done" ? "2026-10-05" : "—"}\n`).join("\n")}`;

  it("every slice that is proof ready or done, or the one given by hand whatever its status", () => {
    const md = roadmap(["done", "proof ready", "in progress", "not started"]);
    expect(dueSlices(md)).toEqual([0, 1]);
    expect(dueSlices(md, "")).toEqual([0, 1]);
    expect(dueSlices(md, "3")).toEqual([3]);
    expect(() => dueSlices(md, "7")).toThrow("no Slice 7");
    expect(() => dueSlices(md, "1; rm -rf /")).toThrow("a slice number");
  });
});
