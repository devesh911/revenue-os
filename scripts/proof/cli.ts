// `bun run proof <slice> [--out <folder>]`: runs that slice's proof steps against the real product in order, writes
// its short report (report.md, beside the files the steps wrote) into the folder (a new temporary one without
// --out), and prints it. Exit 1 when a step failed or the slice has no steps yet; exit 0 when every step passed, or
// when the only steps not passed wait on Devesh: waiting is no failure, but only a run whose every step passed can
// set a slice to done, so the report and `result=passed|waiting|failed` (in GITHUB_OUTPUT, for the proof workflow)
// say which. A slice ROADMAP.md does not have, or other arguments: exit 2.

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseRoadmap } from "../../docs/tracker/parse.js";
import type { Outcome } from "../done-gate/proof-run";
import { reportText } from "./report";
import { overall, type Result, runSteps } from "./run";
import { SLICES } from "./slices";
import type { Step } from "./step";

/**
 * Proves slice `n` with `steps` (none: the slice has no proof yet, which fails), writes report.md into `o.dir`,
 * tells GITHUB_OUTPUT the result when `o.env` names it, and gives the report, the result and the exit code.
 */
export async function prove(
  n: number,
  steps: Step[] | undefined,
  o: { root: string; env: NodeJS.ProcessEnv; state: string; dir: string },
): Promise<{ text: string; result: Outcome; code: number }> {
  mkdirSync(o.dir, { recursive: true });
  const results: Result[] = steps
    ? await runSteps(steps, o)
    : [
        {
          does: `Runs Slice ${n}'s proof steps`,
          outcome: "failed",
          seen: `Slice ${n} has no proof steps yet: write them in scripts/proof/slice-${n}.ts and list them in scripts/proof/slices.ts`,
          files: [],
        },
      ];
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_OUTPUT } =
    o.env;
  const text = reportText(n, results, {
    run:
      GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
        ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
        : undefined,
    // the checkout's commit: a run after a deploy checks out the deployed one, while GITHUB_SHA is main's newest
    commit:
      spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: o.root,
        encoding: "utf8",
      }).stdout?.trim() || "unknown",
    date: new Date().toISOString().slice(0, 10),
  });
  writeFileSync(join(o.dir, "report.md"), text);
  const result = overall(results);
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `result=${result}\n`);
  return { text, result, code: result === "failed" ? 1 : 0 };
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..", "..");
  const read = (f: string) => readFileSync(join(root, f), "utf8");
  const [slice = "", flag, out, ...rest] = process.argv.slice(2);
  if (
    !/^\d+$/.test(slice) ||
    (flag !== undefined && (flag !== "--out" || !out)) ||
    rest.length
  ) {
    console.error("usage: bun run proof <slice number> [--out <folder>]");
    process.exit(2);
  }
  const n = Number(slice);
  if (!parseRoadmap(read("ROADMAP.md")).slices.some((s) => s.n === n)) {
    console.error(`ROADMAP.md has no Slice ${n}`);
    process.exit(2);
  }
  const dir = out
    ? resolve(out)
    : mkdtempSync(join(tmpdir(), `proof-slice-${n}-`));
  const { text, code } = await prove(n, SLICES[n], {
    root,
    env: process.env,
    state: read("STATE.md"),
    dir,
  });
  console.log(`${text}\nThe report and its files: ${dir}`);
  process.exit(code); // a step still running past its time must not hold the run open
}
