// A wait with a deadline of its own, set before bun's time limit for the test. At that limit bun fails the test but
// can't stop its code, and the file's clean-up then runs while that code still works: a check it makes afterwards
// reads data half cleaned up and reports it as lost. On 2026-10-05 the whole-suite-at-once test ran late on a machine
// loaded to 274 and reported another company's audit, usage and queued jobs as gone.
import { cpus, loadavg } from "node:os";

/** `work`'s result, or, after `ms`, a failure naming `what` as late and this machine's load. */
export async function within<T>(
  ms: number,
  what: string,
  work: Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, fail) => {
    timer = setTimeout(
      () =>
        fail(
          new Error(
            `${what} did not finish within ${ms / 1000} s, so nothing was checked; this machine's load average is ${Math.round(loadavg()[0] ?? 0)} on ${cpus().length} cores`,
          ),
        ),
      ms,
    );
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}
