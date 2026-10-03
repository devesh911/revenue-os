// A slice's short proof report, as Markdown: its heading, the run it came from, what that means for the slice, and
// each step with what it did, what was seen and the files it wrote. It is report.md in the report folder, what
// `bun run proof` prints, and the comment the proof workflow posts to the "Proof reports" issue.

import { type Outcome, reportHeading } from "../done-gate/proof-run";
import { overall, type Result } from "./run";

const MARK: Record<Outcome, string> = {
  passed: "✓",
  waiting: "…",
  failed: "✗",
};
const MEANS: Record<Outcome, (n: number) => string> = {
  passed: (n) =>
    `Every step passed: Slice ${n} can be set to done with this run's date and link.`,
  waiting: (n) =>
    `No step failed, but some wait on Devesh, so Slice ${n} and its items stay as they are.`,
  failed: (n) =>
    `A step failed: Slice ${n} gets an item naming each failure and goes back to in progress.`,
};
const LONGEST = 2000; // characters of what one step saw; a comment holds at most 65,536
const shortened = (s: string) =>
  (s.length > LONGEST
    ? `${s.slice(0, LONGEST)}… (cut here; the run's log has the rest)`
    : s
  ).replace(/\n/g, "\n   ");

/** PURE: slice `n`'s results and where they were seen (the run's link, if it is one, the commit and the date) → the report. */
export function reportText(
  n: number,
  results: Result[],
  where: { run?: string; commit: string; date: string },
): string {
  const outcome = overall(results);
  return [
    reportHeading(n, outcome),
    `Run: ${where.run ?? "this machine, not a run of the proof workflow"} · commit ${where.commit.slice(0, 7)} · ${where.date}`,
    "",
    outcome === "passed" && !where.run
      ? `Every step passed here; only a passing run of the proof workflow on main can set Slice ${n} to done.`
      : MEANS[outcome](n),
    "",
    ...results.flatMap((r, i) => [
      `${i + 1}. ${MARK[r.outcome]} ${r.outcome}: ${r.does}`,
      `   ${r.outcome === "waiting" ? "Waits on Devesh for" : "Seen"}: ${shortened(r.seen)}`,
      ...(r.files.length
        ? [`   Files (in the run's artifact): ${r.files.join(", ")}`]
        : []),
    ]),
    "",
  ].join("\n");
}
