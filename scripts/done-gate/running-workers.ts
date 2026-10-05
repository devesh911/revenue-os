// A worker (bun running services/worker/src/index.ts) works every company's due jobs on the one local database,
// whichever checkout started it, so a test that queues jobs sees them vanish as if a test had deleted them. The
// checks on the database, and the test that runs the whole suite at once, refuse to start while one runs.

import { spawnSync } from "node:child_process";

// Bun running the worker's entry file, from any checkout: `bun --watch services/worker/src/index.ts` (`bun run dev`,
// the "api" preview in .claude/launch.json) and `bun services/worker/src/index.ts` (the browser checks, the verifier).
const WORKER =
  /^\s*\d+\s+(?:\S*\/)?bun\s(?:.*\s)?\S*services\/worker\/src\/index\.ts(?:\s|$)/;

/** Throws, naming each worker running on this machine and how to stop it, or when it can't list the processes. */
export function noWorkerRunning() {
  // The ps first on the PATH scripts/done-gate.ts sets, as for `docker` (checks.ts); -ww: whole command lines.
  const r = spawnSync("ps", ["-A", "-ww", "-o", "pid=,args="], {
    encoding: "utf8",
    env: process.env,
  });
  if (r.status !== 0)
    throw new Error(
      `could not look for a running worker: ps failed: ${(r.error?.message ?? r.stderr ?? "").trim()}`,
    );
  const workers = r.stdout
    .split("\n")
    .filter((l) => WORKER.test(l))
    .map((l) => l.trim());
  if (workers.length)
    throw new Error(
      `a worker is running on this machine, and it takes every company's due jobs from the one local database, so tests that queue jobs see them vanish:\n${workers.map((w) => `- ${w}`).join("\n")}\nStop each one listed (\`kill ${workers.map((w) => w.split(" ")[0]).join(" ")}\`; the Claude app stops a preview it started from the "api" configuration in .claude/launch.json), then run again.`,
    );
}
