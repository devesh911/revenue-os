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
import { reportText } from "./report";
import { overall, type Result, runSteps } from "./run";
import { SLICES } from "./slices";

const ROOT = join(import.meta.dir, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

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
mkdirSync(dir, { recursive: true });
const steps = SLICES[n];
const results: Result[] = steps
  ? await runSteps(steps, {
      root: ROOT,
      env: process.env,
      state: read("STATE.md"),
      dir,
    })
  : [
      {
        does: `Runs Slice ${n}'s proof steps`,
        outcome: "failed",
        seen: `Slice ${n} has no proof steps yet: write them in scripts/proof/slice-${n}.ts and list them in scripts/proof/slices.ts`,
        files: [],
      },
    ];
const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_OUTPUT } =
  process.env;
const text = reportText(n, results, {
  run:
    GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
      ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
      : undefined,
  // the commit proved: the checkout's, which a run after a deploy sets to the deployed commit (GITHUB_SHA is main's tip)
  commit:
    spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).stdout?.trim() || "unknown",
  date: new Date().toISOString().slice(0, 10),
});
writeFileSync(join(dir, "report.md"), text);
console.log(`${text}\nThe report and its files: ${dir}`);
const result = overall(results);
if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `result=${result}\n`);
process.exit(result === "failed" ? 1 : 0); // a step still running past its time must not hold the run open
