// Runs one slice's proof steps in order, every one of them, and gives each a result: passed, failed, or waiting on
// Devesh (it needs something STATE.md → Waiting on Devesh still lists, so its check does not run). Each step has
// its own time, and the run has its own, so the report is written before the proof job's limit.

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Outcome } from "../done-gate/proof-run";
import { type Context, type Step, WaitingOn } from "./step";
import { startClock, stopClock } from "./time-limit";
import { waitsOn } from "./waiting";

// A run's steps, all together. proof.yml's job allows 120 minutes: the rest is its setup and the report's upload.
export const RUN_MINUTES = 100;

export type Result = {
  does: string;
  outcome: Outcome;
  seen: string; // what was seen, or what the step waits on
  files: string[]; // the files it wrote, by their names in the report folder
};

const NAME = /^\w[\w.-]*$/; // a plain file name: no folder, nothing hidden

/**
 * Each step's result, in order; a failed step does not stop the ones after it. Files go into `dir`. A step fails
 * when it runs past its own minutes or the run's (`minutes`, RUN_MINUTES unless set); once the run's are spent,
 * the steps left fail without running.
 */
export async function runSteps(
  steps: Step[],
  o: {
    root: string;
    env: NodeJS.ProcessEnv;
    state: string;
    dir: string;
    minutes?: number;
  },
): Promise<Result[]> {
  mkdirSync(o.dir, { recursive: true });
  const runMinutes = o.minutes ?? RUN_MINUTES;
  const runEnds = Date.now() + runMinutes * 60_000;
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
    if (Date.now() >= runEnds) {
      results.push({
        does: step.does,
        outcome: "failed",
        seen: `the run's time ran out (${runMinutes} minutes) before this step started`,
        files: [],
      });
      continue;
    }
    const minutes = step.minutes ?? 10;
    const started = Date.now();
    const ends = Math.min(started + minutes * 60_000, runEnds);
    const limit =
      ends === runEnds
        ? `before the run's time ran out (${runMinutes} minutes)`
        : `in ${minutes} minute(s)`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, fail) => {
      timer = setTimeout(
        () => fail(new Error(`did not finish ${limit}`)),
        ends - started,
      );
    });
    let result: Pick<Result, "outcome" | "seen">;
    startClock(ends);
    try {
      const seen = await Promise.race([
        Promise.resolve().then(() => step.check(ctx)),
        late,
      ]);
      result = { outcome: "passed", seen: String(seen) };
    } catch (e) {
      const seen = e instanceof Error ? e.message : String(e);
      result = { outcome: e instanceof WaitingOn ? "waiting" : "failed", seen };
    } finally {
      clearTimeout(timer);
    }
    // A check that blocked past its time (a command no helper started) is never reported as passed.
    if (stopClock() && !result.seen.startsWith("did not finish"))
      result = {
        outcome: "failed",
        seen: `did not finish ${limit}: it ran ${Math.round((Date.now() - started) / 1000)} s, and said ${result.seen}`,
      };
    try {
      step.cleanUp?.();
    } catch (e) {
      result = {
        outcome: "failed",
        seen: `${result.seen}; then its clean-up failed: ${e instanceof Error ? e.message : String(e)}`,
      };
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
