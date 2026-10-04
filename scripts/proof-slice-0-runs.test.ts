// Slice 0's proof step for GitHub's run records (scripts/proof/slice-0-runs.ts), judged as data: the step that
// updates the cloud test database starts only after `checks` passed on the same commit, and is skipped when no
// migration changed. The read of GitHub's real records runs only in `bun run proof 0`.
import { describe, expect, it } from "bun:test";
import { runRecordProblems } from "./proof/slice-0-runs";

describe("GitHub's run records: the cloud test database changes only after checks pass", () => {
  const at = (m: number) => `2026-10-03T07:${String(m).padStart(2, "0")}:00Z`;
  const staging = (sha: string, start: number, apply: string) => ({
    url: `https://example.invalid/runs/${sha}`,
    sha,
    jobs: [
      {
        name: "staging-migrations",
        conclusion: "success",
        startedAt: at(start),
        steps: [{ name: "Apply migrations to staging", conclusion: apply }],
      },
    ],
  });
  const ci = (sha: string, done: number, conclusion = "success") => ({
    sha,
    jobs: [{ name: "checks", conclusion, completedAt: at(done) }],
  });
  const touches = (sha: string) => sha.startsWith("m");

  it("passes when each run started after checks passed on its commit and skipped the apply step with no migration changed", () => {
    expect(
      runRecordProblems(
        [staging("a1", 10, "skipped"), staging("m1", 20, "success")],
        [ci("a1", 9), ci("m1", 19)],
        touches,
      ),
    ).toEqual([]);
  });

  it("names a run that started before checks passed, one with no passed checks, one that applied with no migration changed, and a window with no skip", () => {
    const problems = runRecordProblems(
      [
        staging("a1", 10, "success"),
        staging("m1", 20, "success"),
        staging("a2", 30, "skipped"),
      ],
      [ci("a1", 9), ci("m1", 21), ci("a2", 29, "failure")],
      touches,
    ).join("\n");
    expect(problems).toContain("a1 changed no migration");
    expect(problems).toContain("before `checks` passed on m1");
    expect(problems).toContain("`checks` did not pass on a2");
    expect(
      runRecordProblems(
        [staging("m1", 20, "success")],
        [ci("m1", 19)],
        touches,
      ).join("\n"),
    ).toContain("no run on a commit that changed no migration");
    expect(runRecordProblems([], [], touches).join("\n")).toContain(
      "no run of staging-migrations",
    );
  });

  it("does not hold a run whose job was skipped, which never reached the cloud", () => {
    const skipped = {
      ...staging("b1", 40, "skipped"),
      jobs: [
        {
          name: "staging-migrations",
          conclusion: "skipped",
          startedAt: at(40),
          steps: [],
        },
      ],
    };
    expect(
      runRecordProblems(
        [skipped, staging("a1", 10, "skipped")],
        [ci("b1", 39, "failure"), ci("a1", 9)],
        touches,
      ),
    ).toEqual([]);
  });
});
