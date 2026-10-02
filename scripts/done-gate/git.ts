// Runs git for the gate: its output trimmed, and a clear error when git fails unless failing is allowed.

import { spawnSync } from "node:child_process";

export function git(
  cwd: string,
  args: string[],
  env: Record<string, string> = {},
  mayFail = false,
): string {
  const r = spawnSync("git", args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 256 << 20,
  });
  if (r.status !== 0 && !mayFail)
    throw new Error(`git ${args[0]} failed: ${r.stderr.trim()}`);
  return r.status === 0 ? r.stdout.trim() : "";
}
