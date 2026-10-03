// Slice 0's proof steps, in the order ROADMAP.md → Slice 0 → Proof gives them.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRoadmap, parseState } from "../../docs/tracker/parse.js";
import type { Step } from "./step";

const LAW = ["AGENTS.md", "docs/NORTH-STAR.md", "ROADMAP.md", "STATE.md"];

export const steps: Step[] = [
  {
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
  },
];
