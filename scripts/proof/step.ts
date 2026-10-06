// What one proof step is: what it does, what it needs that only Devesh can provide, and the check it runs against
// the real product. A slice's steps live in scripts/proof/slice-<n>.ts, listed in scripts/proof/slices.ts.

/**
 * Something a step needs from STATE.md → Waiting on Devesh: the item, named as that list names it (its bold
 * title, such as "A second Anthropic key for the automatic test conversations"), and how a run tells it is here
 * (for that key: `(env) => !!env.ANTHROPIC_EVALS_KEY`).
 */
export type Need = {
  item: string;
  arrived: (env: NodeJS.ProcessEnv) => boolean;
};

/** What a step's check is handed. */
export type Context = {
  root: string; // the checkout being proved
  env: NodeJS.ProcessEnv;
  /**
   * A path in the report folder for this step to write a file to (a transcript, a screenshot, a recording), named
   * by a plain file name. The report lists each one the step wrote; the run keeps them as its artifact.
   */
  file: (name: string) => string;
};

export type Step = {
  does: string; // what the step does, in plain words: the report's "what was done"
  needs?: Need[];
  minutes?: number; // how long its check may take before the step fails (10 unless set)
  /** Returns what was seen. Throws, saying what was seen instead, when the product does not do what it should. */
  check: (ctx: Context) => string | Promise<string>;
  /**
   * Removes what the check started outside the run (a container, a process), run as soon as the step ends: also when
   * it ran past its time, whose check is no longer awaited, so nothing it started outlives the step. Synchronous, with
   * its own time limits, as the step's clock has run out by then.
   */
  cleanUp?: () => void;
};

/**
 * What a check throws when something it needs from Devesh turns out unusable while it runs (the evals key, its
 * spending limit used up): the step waits on that STATE.md → Waiting on Devesh item, which the message names,
 * instead of failing, so the slice and its items stay as they are.
 */
export class WaitingOn extends Error {}
