// The Slice 0 proof tests pass where main's tests-proven check runs them: in its copy of this change, laid over
// main's commit and left uncommitted (scripts/done-gate/code-copy.ts), made from this checkout, which on GitHub is a
// pull request's detached commit with no branch of its own. They hand the steps this checkout's files as they are
// on disk, committed, so the steps prove the change and not main's commit.
import { afterAll, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { codeCopy } from "./done-gate/code-copy";

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
  const [base = ""] = lines("merge-base", "origin/main", "HEAD");
  copy = codeCopy(ROOT, base, [
    ...new Set([
      ...lines("diff", "--name-only", base),
      ...lines("ls-files", "--others", "--exclude-standard"),
    ]),
  ]);
  const r = spawnSync(
    process.execPath,
    [
      "test",
      "./scripts/proof-slice-0.test.ts",
      "--test-name-pattern=follow its Proof line|the banner step passes",
    ],
    { cwd: copy, env: { ...process.env, CI: "1" }, encoding: "utf8" },
  );
  const out = `${r.stdout}${r.stderr}`;
  // On a failure, the copy's own output says why.
  expect({
    status: r.status,
    out: r.status === 0 ? "" : out.slice(-4000),
  }).toEqual({
    status: 0,
    out: "",
  });
  expect(out).toContain(" 2 pass");
}, 300_000);
