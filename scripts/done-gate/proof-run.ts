// What a run of the proof workflow (.github/workflows/proof.yml) says about one slice, read from its jobs as GitHub
// reports them, and the heading of a slice's proof report. The proof runner (scripts/proof/) writes by these, the
// cycle banner reads by them, and rules-from-main judges a pull request that sets a slice to done by them.

export const PROOF_WORKFLOW = ".github/workflows/proof.yml";
// The step proof.yml runs only when every step of the slice passed: a run whose slice only waits on Devesh
// still succeeds, so the run's conclusion alone can't tell passed from waiting.
export const ALL_PASSED = "Every step passed";

export type Outcome = "passed" | "waiting" | "failed";
export type Job = {
  name?: string;
  status?: string;
  conclusion?: string | null;
  steps?: { name?: string; conclusion?: string | null }[];
};

/**
 * PURE: a run's jobs → what it says about slice `n`: its job `proof (n)` (GitHub names a matrix job by its id and
 * value) still going, failed (any end but success), passed (it ran the every-step-passed step) or waiting; nothing
 * when the run has no job for that slice.
 */
export function sliceOutcome(
  jobs: Job[],
  n: number,
): Outcome | "running" | undefined {
  const job = jobs.find((j) => j.name === `proof (${n})`);
  if (!job) return;
  if (job.status !== "completed") return "running";
  if (job.conclusion !== "success") return "failed";
  return job.steps?.some(
    (s) => s.name === ALL_PASSED && s.conclusion === "success",
  )
    ? "passed"
    : "waiting";
}

/** PURE: a slice's proof report opens with this line; the pull request that sets the slice to done shows it. */
export const reportHeading = (n: number, outcome: Outcome) =>
  `## Proof report: Slice ${n} — ${outcome}`;
