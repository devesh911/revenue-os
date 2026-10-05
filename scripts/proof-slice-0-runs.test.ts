// Slice 0's proof step for GitHub's run records (scripts/proof/slice-0-runs.ts), judged as data: the step that
// updates the cloud test database starts only after `checks` passed on the same commit, and is skipped when no
// migration changed. The read of GitHub's real records runs only in `bun run proof 0`.
import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRecordProblems, runRecords } from "./proof/slice-0-runs";

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

  it("says no ci run was found, or no jobs were returned, rather than that checks did not pass", () => {
    const missing = runRecordProblems(
      [staging("a1", 10, "skipped")],
      [],
      touches,
    ).join("\n");
    expect(missing).toContain("found no ci run on a1");
    expect(missing).not.toContain("did not pass");
    const noJobs = runRecordProblems(
      [staging("a1", 10, "skipped")],
      [{ sha: "a1", url: "https://example.invalid/ci/a1", jobs: [] }],
      touches,
    ).join("\n");
    expect(noJobs).toContain(
      "GitHub returned no jobs for ci's run on a1 (https://example.invalid/ci/a1)",
    );
    expect(noJobs).not.toContain("did not pass");
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

describe("the run-records step reads GitHub's records with gh", () => {
  // A stand-in gh on PATH answering as GitHub did on 2026-10-05 at 14:04 UTC: the listing of ci's recent runs on
  // main left out the runs on these commits, while each commit's own run, asked for by commit, was there.
  it("finds each commit's ci run by its commit, so a run the recent-runs listing leaves out still counts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "proof-runs-"));
    const path = process.env.PATH;
    try {
      const repo = join(dir, "repo");
      const git = (...a: string[]) =>
        execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" }).trim();
      mkdirSync(join(repo, "supabase/migrations"), { recursive: true });
      execFileSync("git", ["init", "-q", repo]);
      const commit = (file: string) => {
        writeFileSync(join(repo, file), file);
        git("add", ".");
        git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", file);
        return git("rev-parse", "HEAD");
      };
      commit("README");
      const clean = commit("notes.txt");
      const migration = commit("supabase/migrations/001_x.sql");
      const at = (m: number) =>
        `2026-10-05T14:${String(m).padStart(2, "0")}:00Z`;
      const runs: Record<string, object> = {
        "1": {
          jobs: [
            {
              name: "staging-migrations",
              conclusion: "success",
              startedAt: at(10),
              steps: [
                { name: "Apply migrations to staging", conclusion: "skipped" },
              ],
            },
          ],
        },
        "2": {
          jobs: [
            {
              name: "staging-migrations",
              conclusion: "success",
              startedAt: at(20),
              steps: [
                { name: "Apply migrations to staging", conclusion: "success" },
              ],
            },
          ],
        },
        "11": {
          jobs: [{ name: "checks", conclusion: "success", completedAt: at(9) }],
        },
        "12": {
          jobs: [
            { name: "checks", conclusion: "success", completedAt: at(19) },
          ],
        },
      };
      const staging = [
        {
          databaseId: 1,
          headSha: clean,
          url: "https://example.invalid/runs/1",
        },
        {
          databaseId: 2,
          headSha: migration,
          url: "https://example.invalid/runs/2",
        },
      ];
      const ci: Record<string, object[]> = {
        [clean]: [
          {
            databaseId: 11,
            headSha: clean,
            url: "https://example.invalid/runs/11",
          },
        ],
        [migration]: [
          {
            databaseId: 12,
            headSha: migration,
            url: "https://example.invalid/runs/12",
          },
        ],
      };
      const bin = join(dir, "bin");
      mkdirSync(bin);
      writeFileSync(
        join(bin, "gh"),
        `#!${process.execPath}
const a = process.argv.slice(2);
const runs = ${JSON.stringify(runs)}, staging = ${JSON.stringify(staging)}, ci = ${JSON.stringify(ci)};
const flag = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
if (a[1] === "view") console.log(JSON.stringify(runs[a[2]]));
else if (flag("--workflow") === "staging-migrations.yml") console.log(JSON.stringify(staging));
else console.log(JSON.stringify(ci[flag("--commit")] ?? []));
`,
      );
      chmodSync(join(bin, "gh"), 0o755);
      process.env.PATH = `${bin}:${path}`;
      const seen = await runRecords.check({
        root: repo,
        env: {},
        file: (name) => join(dir, name),
      });
      expect(seen).toContain(
        "the 2 that ran started after `checks` passed on their commit",
      );
    } finally {
      process.env.PATH = path;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
