// Main's code beside the change's tests: a scratch copy, outside the repo, of the commit the change left main at,
// with each file the caller names (the change's tests, helpers, fixtures and anything else that is not product code)
// as the change has it, and the packages installed.

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// main's own .gitattributes must not leave files out of the copy (export-ignore), so attributes come from the empty tree
const NO_ATTRIBUTES = "--attr-source=4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** The copy's folder, by its real path (bun names files by theirs); the caller removes it. */
export function mainCopy(
  repo: string,
  from: string,
  fromChange: string[],
): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "done-gate-main-")));
  try {
    const archive = spawnSync("git", [NO_ATTRIBUTES, "archive", from], {
      cwd: repo,
      maxBuffer: 1 << 30,
    });
    if (archive.status !== 0)
      throw new Error(`git archive ${from} failed: ${archive.stderr}`);
    const tar = spawnSync("tar", ["-x", "-f", "-", "-C", dir], {
      input: archive.stdout,
    });
    if (tar.status !== 0)
      throw new Error(`unpacking main's code failed: ${tar.stderr}`);
    for (const f of fromChange) {
      const to = join(dir, f);
      rmSync(to, { force: true });
      if (!existsSync(join(repo, f))) continue; // the change deletes it
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(join(repo, f), to);
    }
    if (existsSync(join(dir, "bun.lock"))) {
      const install = spawnSync(
        process.execPath,
        ["install", "--frozen-lockfile"],
        { cwd: dir, encoding: "utf8" },
      );
      if (install.status !== 0)
        throw new Error(
          `bun install in main's copy failed: ${`${install.stdout}${install.stderr}`.trim().split("\n").slice(-5).join("\n")}`,
        );
    }
    return dir;
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}
