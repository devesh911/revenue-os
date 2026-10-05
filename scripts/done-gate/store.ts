// The gate's record: one small file per fact under .git/done-gate, shared by every checkout of the repository.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { git } from "./git";

/**
 * The gate's folder inside the repository's shared git folder, the same for every checkout. Under load Bun's
 * synchronous spawn can hand back no output from a git that succeeded (oven-sh/bun#34069), and that empty answer
 * would name a `done-gate/` folder inside the checkout: a lock of its own, free while another run holds the real
 * one. So git is asked again, and a run that still gets no absolute folder stops.
 */
export function stateDir(repo: string): string {
  let common = "";
  for (let ask = 0; ask < 3 && !isAbsolute(common); ask++)
    common = git(repo, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
  if (!isAbsolute(common))
    throw new Error(
      `git named no shared folder for the repository at ${repo} (asked three times; last answer "${common}"), so the gate can't find the lock and record every checkout shares.`,
    );
  const dir = join(common, "done-gate");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export class Store {
  constructor(private readonly dir: string) {}
  private file(kind: string, key: string) {
    mkdirSync(join(this.dir, kind), { recursive: true });
    return join(this.dir, kind, key.replace(/[^\w.-]/g, "_"));
  }
  get(kind: string, key: string) {
    const f = this.file(kind, key);
    return existsSync(f) ? readFileSync(f, "utf8") : undefined;
  }
  put(kind: string, key: string, value: string) {
    writeFileSync(this.file(kind, key), value);
  }
  take(kind: string, key: string) {
    const value = this.get(kind, key);
    rmSync(this.file(kind, key), { force: true });
    return value;
  }
  /** The keys of `kind` that start with `prefix`, each with when it was written. */
  list(kind: string, prefix = "") {
    const dir = join(this.dir, kind);
    return existsSync(dir)
      ? readdirSync(dir)
          .filter((k) => k.startsWith(prefix))
          .map((key) => ({ key, at: statSync(join(dir, key)).mtimeMs }))
      : [];
  }
}
