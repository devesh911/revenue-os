// The checks on the local database (tests, database policies, browser checks) that did not run, and why: on a
// machine without Docker they never run (CI runs them); while background work runs, such as a dev server or a test
// run that may hold the database, they wait for the first stop after it ends. Either way Devesh sees what did not
// run, never a ✓.

import { noDocker } from "./checks";

export const NOT_RUN = {
  here: "Done gate ⚠ NOT fully checked: tests, database policies and browser checks did not run here; CI runs them",
  yet: "Done gate ⏳ NOT fully checked yet: tests, database policies and browser checks wait while background work runs; the first stop after it ends runs them",
} as const;
export type NotRun = keyof typeof NOT_RUN;

/** `background`: work the session left running. Undefined when the database checks can run now. */
export const notRunWhy = (background: boolean): NotRun | undefined =>
  noDocker() ? "here" : background ? "yet" : undefined;
