// The running step's time limit, which every command a step starts through the proof's helpers obeys (scratch.ts
// sh and git, gate.ts hook, claude.ts, the run-records step's gh): spawnSync blocks, so no timer can stop a step
// that waits on one; the command itself is stopped when the step's time is up, and run.ts then fails the step.

let until = Number.POSITIVE_INFINITY;

/** Starts the running step's clock: its commands may run until `deadline` (a time in milliseconds). */
export const startClock = (deadline: number) => {
  until = deadline;
};

/** Stops the clock; true when the step ran past its time. */
export function stopClock() {
  const over = Date.now() >= until;
  until = Number.POSITIVE_INFINITY;
  return over;
}

/**
 * The time left for the running step's next command, in milliseconds, at most `most`, as spawnSync's `timeout`
 * takes it: nothing outside a step and with no `most`.
 */
export function timeLeft(most = Number.POSITIVE_INFINITY) {
  const left = Math.min(until - Date.now(), most);
  return Number.isFinite(left) ? Math.max(1, left) : undefined;
}
