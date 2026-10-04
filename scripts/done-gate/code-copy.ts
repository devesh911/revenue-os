// A scratch copy of the code outside the repo, built the same way for both runs of the tests-proven check, so that
// what the caller names is all that differs between them: the commit the change left main at, cloned with its
// history (a test can run git in it), with each file the caller names as the change has it (a link stays a link,
// a file the change deletes is gone), and the packages installed. Neither copy holds what git ignores.

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Main's own .gitattributes must not leave files out or run a filter on them, so attributes come from the empty
// tree, and no hook of Devesh's runs in the copy.
const SAFE = [
  "--attr-source=4b825dc642cb6eb9a060e54bf8d69288fbee4904",
  "-c",
  "core.hooksPath=/dev/null",
];

const step = (what: string, cmd: string, args: string[], cwd?: string) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0)
    throw new Error(
      `${what} failed: ${`${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-5).join("\n")}`,
    );
};

/** The copy's folder, by its real path (bun names files by theirs); the caller removes it. */
export function codeCopy(repo: string, from: string, files: string[]): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "done-gate-copy-")));
  try {
    step("cloning main's code", "git", [
      ...SAFE,
      "clone",
      "-q",
      "--shared",
      "--no-checkout",
      repo,
      dir,
    ]);
    step(
      `checking out ${from}`,
      "git",
      [...SAFE, "checkout", "-q", "--detach", from],
      dir,
    );
    for (const f of files) {
      const to = join(dir, f);
      rmSync(to, { recursive: true, force: true });
      let link: boolean;
      try {
        link = lstatSync(join(repo, f)).isSymbolicLink();
      } catch {
        continue; // the change deletes it
      }
      mkdirSync(dirname(to), { recursive: true });
      if (link) symlinkSync(readlinkSync(join(repo, f)), to);
      else copyFileSync(join(repo, f), to);
    }
    if (existsSync(join(dir, "bun.lock")))
      step(
        "bun install",
        process.execPath,
        ["install", "--frozen-lockfile"],
        dir,
      );
    return dir;
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}
