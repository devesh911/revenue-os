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
};
