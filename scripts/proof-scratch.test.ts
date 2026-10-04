// The scratch repositories Slice 0's proof steps make (scripts/proof/scratch.ts): git's automatic clean-up is off in
// every git command they run.
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "./proof/scratch";

setDefaultTimeout(30_000);
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const scratch = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), name));
  dirs.push(dir);
  return dir;
};

describe("the steps' scratch repositories", () => {
  it("run every git command with git's automatic clean-up off, even where the repository asks for it", () => {
    const dir = scratch("proof-git-");
    git(dir, "init", "-q");
    git(dir, "config", "gc.auto", "1"); // clean up after nearly every command
    git(dir, "config", "maintenance.auto", "true");
    expect([
      git(dir, "config", "gc.auto"),
      git(dir, "config", "maintenance.auto"),
    ]).toEqual(["0", "false"]);
  });
});
