// Slice 0's proof, its first two steps: the plan is in the repo, readable, and the banner every session starts with
// names where we are, the hooks behind it passing the tests the Proof line cites.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  currentSlice,
  nextItem,
  parseRoadmap,
  parseState,
} from "../../docs/tracker/parse.js";
import { namedTestsPass } from "./named-tests";
import { git, sh } from "./scratch";
import type { Step } from "./step";

const LAW = ["AGENTS.md", "docs/NORTH-STAR.md", "ROADMAP.md", "STATE.md"];

export const lawFiles: Step = {
  does: "Checks that the four law files (AGENTS.md, docs/NORTH-STAR.md, ROADMAP.md, STATE.md) exist and that the tracker's parser (docs/tracker/parse.js, which the tracker page runs) reads ROADMAP.md and STATE.md with no problems",
  check: ({ root }) => {
    const missing = LAW.filter((f) => !existsSync(join(root, f)));
    if (missing.length) throw new Error(`missing: ${missing.join(", ")}`);
    const read = (f: string) => readFileSync(join(root, f), "utf8");
    const roadmap = parseRoadmap(read("ROADMAP.md"));
    const state = parseState(read("STATE.md"));
    const problems = [...roadmap.problems, ...state.problems];
    if (problems.length)
      throw new Error(
        `the parser found ${problems.length} problem(s):\n${problems.join("\n")}`,
      );
    return `all four exist; the parser read ${roadmap.slices.length} slices from ROADMAP.md and ${state.rows.length} rows of What works today from STATE.md with no problems`;
  },
};

/**
 * The current slice and its next item, as the tracker's parser reads ROADMAP.md where the banner reads it: on
 * origin/main, or in the checkout when it has no origin/main.
 */
export function whereWeAre(root: string) {
  let roadmap: string;
  try {
    roadmap = git(root, "show", "origin/main:ROADMAP.md");
  } catch {
    roadmap = readFileSync(join(root, "ROADMAP.md"), "utf8");
  }
  const slice = currentSlice(parseRoadmap(roadmap).slices);
  return { slice, item: nextItem(slice)?.text };
}

// The tests the Proof line cites for the hooks behind the banner, by name.
const PIN_TESTS = [
  "the pin names the branch of the folder the agent works in (the hook's cwd), else its own checkout",
  "the per-prompt pin is one line naming this branch's item, the slice, its next item and the rule",
];

export const banner: Step = {
  does: `Runs \`bun run cycle --banner\`, which every agent session starts with, and checks that it names the current slice and its next item as the tracker's parser reads them from ROADMAP.md on origin/main; then runs, by name, the two tests in scripts/cycle.test.ts the Proof line cites for the hooks behind it ("${PIN_TESTS.join('" and "')}"), each of which must pass`,
  check: ({ root }) => {
    const r = sh(root, ["bun", "run", "cycle", "--banner"]);
    const { slice, item } = whereWeAre(root);
    if (!slice)
      throw new Error("ROADMAP.md on origin/main has no current slice");
    const said = (label: string) =>
      r.stdout.match(new RegExp(`^${label}: (.*)$`, "m"))?.[1] ?? "";
    const named = said("Current slice");
    const next = said("Next item");
    if (r.status !== 0 || !named.startsWith(`Slice ${slice.n}: ${slice.title}`))
      throw new Error(
        `it named the current slice as "${named || "(nothing)"}", not Slice ${slice.n}: ${slice.title} (exit ${r.status})`,
      );
    if (item ? next !== item : next)
      throw new Error(
        `it named the next item as "${next || "(nothing)"}", not "${item ?? "(none left)"}"`,
      );
    const pins = namedTestsPass(root, "scripts/cycle.test.ts", PIN_TESTS);
    return `"Current slice: ${named}" and "Next item: ${next || "no item"}"; ${pins}`;
  },
};
