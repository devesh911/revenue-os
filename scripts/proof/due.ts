// Which slices a run of the proof workflow proves: the one given by hand (SLICE), whatever its status, or else every
// slice ROADMAP.md marks `proof ready` or `done`. Told to the workflow as `slices=[…]` in GITHUB_OUTPUT.

import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRoadmap } from "../../docs/tracker/parse.js";

/** PURE: ROADMAP.md and the slice given by hand, if any → the slice numbers to prove; throws on a bad one. */
export function dueSlices(roadmap: string, given = ""): number[] {
  const { slices } = parseRoadmap(roadmap);
  if (!given)
    return slices
      .filter((s) => s.Status === "proof ready" || s.Status === "done")
      .map((s) => s.n);
  if (!/^\d+$/.test(given)) throw new Error(`"${given}" is not a slice number`);
  if (!slices.some((s) => s.n === Number(given)))
    throw new Error(`ROADMAP.md has no Slice ${given}`);
  return [Number(given)];
}

if (import.meta.main) {
  try {
    const due = dueSlices(
      readFileSync(join(import.meta.dir, "..", "..", "ROADMAP.md"), "utf8"),
      process.env.SLICE?.trim(),
    );
    appendFileSync(
      process.env.GITHUB_OUTPUT || "/dev/stdout",
      `slices=${JSON.stringify(due)}\n`,
    );
    console.log(
      due.length
        ? `Proving Slice ${due.join(", Slice ")}.`
        : "No slice is proof ready or done: nothing to prove.",
    );
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    process.exit(1);
  }
}
