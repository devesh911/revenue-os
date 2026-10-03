// Runs one slice's proof steps in order, every one of them, and gives each a result: passed, failed, or waiting on
// Devesh (it needs something STATE.md → Waiting on Devesh still lists, so its check does not run).

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Outcome } from "../done-gate/proof-run";
import type { Context, Step } from "./step";
import { waitsOn } from "./waiting";

export type Result = {
  does: string;
  outcome: Outcome;
  seen: string; // what was seen, or what the step waits on
  files: string[]; // the files it wrote, by their names in the report folder
};

const NAME = /^\w[\w.-]*$/; // a plain file name: no folder, nothing hidden

/** Each step's result, in order; a failed step does not stop the ones after it. Files go into `dir`. */
export async function runSteps(
  steps: Step[],
  o: { root: string; env: NodeJS.ProcessEnv; state: string; dir: string },
): Promise<Result[]> {
  mkdirSync(o.dir, { recursive: true });
  const results: Result[] = [];
  for (const [i, step] of steps.entries()) {
    const wait = waitsOn(step.needs ?? [], o.state, o.env);
    if (wait) {
      results.push(
        "waiting" in wait
          ? {
              does: step.does,
              outcome: "waiting",
              seen: wait.waiting,
              files: [],
            }
          : {
              does: step.does,
              outcome: "failed",
              seen: wait.failed,
              files: [],
            },
      );
      continue;
    }
    const named: string[] = [];
    const ctx: Context = {
      root: o.root,
      env: o.env,
      file: (name) => {
        if (!NAME.test(name))
          throw new Error(`"${name}" is not a plain file name`);
        named.push(`${i + 1}-${name}`);
        return join(o.dir, `${i + 1}-${name}`);
      },
    };
    const minutes = step.minutes ?? 10;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, fail) => {
      timer = setTimeout(
        () => fail(new Error(`did not finish in ${minutes} minute(s)`)),
        minutes * 60_000,
      );
    });
    let result: Pick<Result, "outcome" | "seen">;
    try {
      const seen = await Promise.race([
        Promise.resolve().then(() => step.check(ctx)),
        late,
      ]);
      result = { outcome: "passed", seen: String(seen) };
    } catch (e) {
      result = {
        outcome: "failed",
        seen: e instanceof Error ? e.message : String(e),
      };
    } finally {
      clearTimeout(timer);
    }
    const files = named.filter((f) => existsSync(join(o.dir, f)));
    results.push({ does: step.does, ...result, files });
  }
  return results;
}

/** PURE: the slice's result: passed when every step passed, failed when one failed or it has none, else waiting. */
export const overall = (results: Result[]): Outcome =>
  !results.length || results.some((r) => r.outcome === "failed")
    ? "failed"
    : results.every((r) => r.outcome === "passed")
      ? "passed"
      : "waiting";
