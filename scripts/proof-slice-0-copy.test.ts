// The Slice 0 proof tests pass where main's tests-proven check runs them: in its copy of this change, laid over
// main's commit and left uncommitted (scripts/done-gate/code-copy.ts), made from this checkout, which on GitHub is a
// pull request's detached commit with no branch of its own, and run as the check runs them, with coverage
// (scripts/done-gate/test-run.ts). They hand the steps this checkout's files as they are on disk, committed, so the
// steps prove the change and not main's commit.
import { afterAll, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { codeCopy } from "./done-gate/code-copy";
import { runTestFile } from "./done-gate/test-run";

const ROOT = join(import.meta.dir, "..");
const lines = (...args: string[]) =>
  spawnSync("git", args, { cwd: ROOT, encoding: "utf8" })
    .stdout.split("\n")
    .filter(Boolean);
let copy = "";
afterAll(() => {
  if (copy) rmSync(copy, { recursive: true, force: true });
});

it("the Slice 0 proof tests pass in the tests-proven check's copy of this change, laid over main's commit", () => {
  // main's commit; in the check's own copy, which has no origin/main, the change sits uncommitted on it, at HEAD
  const [base = "HEAD"] = lines("merge-base", "origin/main", "HEAD");
  copy = codeCopy(ROOT, base, [
    ...new Set([
      ...lines("diff", "--name-only", base),
      ...lines("ls-files", "--others", "--exclude-standard"),
    ]),
  ]);
  const r = runTestFile(copy, "scripts/proof-slice-0.test.ts", {
    coverage: true,
    only: "follow its Proof line|the banner step passes",
  });
  // The two it ran (the report lists the others as skipped); on a failure, the copy's own output says why.
  const ran = r.cases.filter((c) => c.outcome !== "skipped");
  expect({
    outcomes: ran.map((c) => c.outcome),
    out: ran.every((c) => c.outcome === "passed") ? "" : r.out.slice(-4000),
  }).toEqual({ outcomes: ["passed", "passed"], out: "" });
}, 300_000);
