// "Where are we" — what every agent session is shown at start and on each prompt (scripts/cycle.ts),
// computed by the one roadmap parser the tracker page also uses (docs/tracker/parse.js).
import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { currentSlice, nextItem, parseRoadmap } from "../docs/tracker/parse.js";
import { banner, type Cycle, pin, problems } from "./cycle";

const ROOT = join(import.meta.dir, "..");
const slice = (
  n: number,
  status: string,
  blocked = "nothing",
  items = "- [ ] Build the thing (agent)",
) =>
  `## Slice ${n}: Title ${n}\nStatus: ${status}\nGoal: g\nProof: p\nBlocked by: ${blocked}\nSeen by Devesh: —\n\n${items}\n`;
const roadmap = (...slices: string[]) => `# Roadmap\n\n${slices.join("\n")}`;
const STATE =
  "PHASE: SETUP\n\n## What works today\n| Area | Capability | Status | Where / why |\n|---|---|---|---|\n| Data | x | Works | y |\n## Waiting on Devesh\n## Decisions in force\n";
const cycle = (over: Partial<Cycle> = {}): Cycle => ({
  roadmap: roadmap(
    slice(0, "in progress", "nothing", "- [ ] Rewrite the patterns (agent)"),
  ),
  state: STATE,
  branch: "feat/x",
  item: "Keep agents on the plan",
  from: "origin/main",
  ...over,
});

it("the current slice is the lowest-numbered one not done, not proof ready and not blocked", () => {
  const { slices } = parseRoadmap(
    roadmap(
      slice(4, "not started"),
      slice(0, "done"),
      slice(1, "proof ready"),
      slice(2, "not started", "Meta test number (Devesh)"),
      slice(3, "in progress"),
    ),
  );
  expect(currentSlice(slices)?.n).toBe(3);
});

it("has no current slice when every open slice waits on Devesh", () => {
  const { slices } = parseRoadmap(
    roadmap(slice(0, "proof ready"), slice(1, "not started", "Slice 0")),
  );
  expect(currentSlice(slices)).toBeUndefined();
});

it("the next item is the first unchecked item an agent owns", () => {
  const [s] = parseRoadmap(
    roadmap(
      slice(
        0,
        "in progress",
        "nothing",
        "- [x] A (agent) · evidence: [#1](https://example.com)\n- [ ] B (Devesh)\n- [ ] C (agent)",
      ),
    ),
  ).slices;
  expect(nextItem(s)?.text).toBe("C");
});

it("the per-prompt pin is one line naming this branch's item, the slice, its next item and the rule", () => {
  const p = pin(cycle());
  expect(p.split("\n")).toHaveLength(1);
  for (const part of [
    '"Keep agents on the plan"',
    "Slice 0",
    '"Rewrite the patterns"',
    "AGENTS.md",
  ])
    expect(p).toContain(part);
});

it("the pin and the banner say CYCLE UNKNOWN instead of going quiet", () => {
  for (const show of [pin, banner])
    expect(show(cycle({ roadmap: "not a roadmap" }))).toStartWith(
      "CYCLE UNKNOWN",
    );
});

it("the banner lists format problems and says when no slice can be built", () => {
  const b = banner(
    cycle({
      roadmap: roadmap(
        slice(0, "proof ready", "nothing", "- [x] Shipped (agent)"),
      ),
    }),
  );
  expect(b).toContain("is ticked without evidence");
  expect(b).toContain("No slice can be built");
});

it("a branch with no recorded item is told how to record one", () => {
  expect(banner(cycle({ item: "" }))).toContain(
    'git config branch.feat/x.description "<item text>"',
  );
  expect(pin(cycle({ branch: "main", item: "" }))).toContain(
    "main has no roadmap item",
  );
});

it("the repo's own ROADMAP.md and STATE.md have no format problems", () => {
  const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
  expect(problems(read("ROADMAP.md"), read("STATE.md"))).toEqual([]);
});

// Hooks drop the output of a command that fails or is not found, so the wrapper must always print.
const hook = (env: Record<string, string>) =>
  spawnSync("sh", ["scripts/cycle-hook.sh", "--pin"], {
    cwd: ROOT,
    encoding: "utf8",
    env,
  });

it("the hook wrapper prints the pin and exits 0", () => {
  const r = hook({ ...process.env } as Record<string, string>);
  expect(r.status).toBe(0);
  expect(r.stdout).toStartWith("CYCLE:");
});

it.skipIf(!existsSync(`${process.env.HOME}/.bun/bin/bun`))(
  "the hook wrapper finds bun in ~/.bun/bin when it is not on PATH",
  () => {
    const r = hook({ PATH: "/usr/bin:/bin", HOME: `${process.env.HOME}` });
    expect(r.status).toBe(0);
    expect(r.stdout).toStartWith("CYCLE:");
  },
);

it("the hook wrapper says CYCLE UNKNOWN and exits 0 when bun is missing", () => {
  const r = hook({ PATH: "/usr/bin:/bin", HOME: "/nonexistent" });
  expect(r.status).toBe(0);
  expect(r.stdout).toStartWith("CYCLE UNKNOWN");
});
