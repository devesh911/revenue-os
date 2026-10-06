// Slice 1's proof steps (scripts/proof/slice-1*.ts). The readiness step's check runs here as `bun run proof 1` runs
// it, on this checkout and the local stack, except that it does not take the local stack's lock: the gate running
// this suite holds it. The image step builds and runs the worker image (minutes, even cached), so it runs only in
// `bun run proof 1`, as the whole-suite step of Slice 0 does; ci.yml's image build checks the image's label.
import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toProve } from "./proof/cli";
import { runSteps } from "./proof/run";
import { everyCheckHasAStep, NOT_YET, steps as slice1 } from "./proof/slice-1";
import { provesReadiness } from "./proof/slice-1-worker";
import { SLICES } from "./proof/slices";

const ROOT = join(import.meta.dir, "..");

describe("Slice 1's steps", () => {
  it("are the ones `bun run proof 1` runs", () => {
    expect(SLICES[1]).toBe(slice1);
    expect(toProve(["1"], ROOT)).toEqual({
      n: 1,
      steps: slice1,
      out: undefined,
    });
  });

  it("the readiness step sees the worker ready, not ready with its database cut off, ready again, and its commit at /release", async () => {
    const seen = await provesReadiness(ROOT, process.env);
    expect(seen).toContain('503 {"ok":false,"unreachable":["database"');
    expect(seen).toContain('once it was back; /release answered {"release":"');
  }, 120_000);

  it("the last step fails while a check the Proof line names has no step, naming each one", async () => {
    const [result] = await runSteps([everyCheckHasAStep], {
      root: ROOT,
      env: {},
      state: "",
      dir: mkdtempSync(join(tmpdir(), "proof-slice-1-")),
    });
    expect(result?.outcome).toBe("failed");
    expect(NOT_YET.length).toBeGreaterThan(0);
    for (const check of NOT_YET) expect(result?.seen).toContain(check);
    expect(slice1.at(-1)).toBe(everyCheckHasAStep);
  });
});
