// The test preload's work-around for Bun's lost-exit bug (tests/setup.local.ts) must reach every way code calls a
// synchronous spawn. On 2026-10-06 it reached only calls through the module object (`childProcess.spawnSync`), not
// the named imports the done gate's own code uses (`import { spawnSync } from "node:child_process"`), and gate
// tests that run that code stalled for ten minutes each under load.
import { expect, it } from "bun:test";
import childProcess, {
  execFileSync,
  execSync,
  spawnSync,
} from "node:child_process";

const GC_FIRST = Symbol.for("revenue-os.gc-before-sync-spawn");

it("a synchronous spawn reached by a named import runs a full memory clean-up first", () => {
  for (const f of [spawnSync, execFileSync, execSync])
    expect((f as unknown as Record<symbol, unknown>)[GC_FIRST]).toBe(true);
  expect(spawnSync).toBe(childProcess.spawnSync);
  expect(spawnSync("true").status).toBe(0);
});
