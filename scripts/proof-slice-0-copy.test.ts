// The Slice 0 proof tests pass in a copy of this change built as main's tests-proven check builds its own: laid over
// main's commit and left uncommitted (scripts/done-gate/code-copy.ts), from this checkout, which on GitHub is a pull
// request's detached commit with no branch of its own, shallow as GitHub's runner left the check's copy, and run as
// the check runs a file, with coverage
// (scripts/done-gate/test-run.ts). They hand the steps this checkout's files as they are on disk, committed, so the
// steps prove the change and not main's commit. The check itself runs every changed test file in turn in one copy;
// that, this test does not repeat.
import { afterAll, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
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

it("the Slice 0 proof tests pass in a copy of this change laid over main's commit, as the tests-proven check builds one", () => {
  // main's commit; in the check's own copy, which has no origin/main, the change sits uncommitted on it, at HEAD
  const [base = "HEAD"] = lines("merge-base", "origin/main", "HEAD");
  copy = codeCopy(ROOT, base, [
    ...new Set([
      ...lines("diff", "--name-only", base),
      ...lines("ls-files", "--others", "--exclude-standard"),
    ]),
  ]);
  // Shallow, as the check's copy was on GitHub's runner: there git fetches from it without writing the fetched ref
  writeFileSync(
    join(copy, ".git", "shallow"),
    `${lines("-C", copy, "rev-parse", "HEAD")[0]}\n`,
  );
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
