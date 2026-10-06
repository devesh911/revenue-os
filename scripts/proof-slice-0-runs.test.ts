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
  /**
   * Runs the step against a scratch repository (one commit changing no migration, one adding one) and a stand-in gh
   * on PATH whose listing of ci's recent runs on main leaves out every run, as GitHub's did on 2026-10-05 at 14:04
   * UTC, while each commit's own run, asked for by commit, is there. `tweak` changes the records first. Returns what
   * the step saw, or the error it threw.
   */
  async function stepWith(
    tweak: (r: {
      runs: Record<string, { jobs: object[] }>;
      ci: Record<string, object[]>;
      clean: string;
      migration: string;
    }) => void = () => {},
  ) {
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
      const staged = (start: number, apply: string) => ({
        jobs: [
          {
            name: "staging-migrations",
            conclusion: "success",
            startedAt: at(start),
            steps: [{ name: "Apply migrations to staging", conclusion: apply }],
          },
        ],
      });
      const checked = (done: number) => ({
        jobs: [
          { name: "checks", conclusion: "success", completedAt: at(done) },
        ],
      });
      const runs = {
        "1": staged(10, "skipped"),
        "2": staged(20, "success"),
        "11": checked(9),
        "12": checked(19),
      };
      const listed = (id: number, sha: string) => ({
        databaseId: id,
        headSha: sha,
        url: `https://example.invalid/runs/${id}`,
      });
      const staging = [listed(1, clean), listed(2, migration)];
      const ci: Record<string, object[]> = {
        [clean]: [listed(11, clean)],
        [migration]: [listed(12, migration)],
      };
      tweak({ runs, ci, clean, migration });
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
      try {
        return {
          seen: await runRecords.check({
            root: repo,
            env: {},
            file: (name) => join(dir, name),
          }),
          clean,
          migration,
        };
      } catch (e) {
        return { error: (e as Error).message, clean, migration };
      }
    } finally {
      process.env.PATH = path;
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("finds each commit's ci run by its commit, so a run the recent-runs listing leaves out still counts", async () => {
    const { seen, error } = await stepWith();
    expect(error).toBeUndefined();
    expect(seen).toContain(
      "the 2 that ran started after `checks` passed on their commit",
    );
  });

  it("says it found no ci run for a commit GitHub has none for, not that checks did not pass", async () => {
    const { error, migration } = await stepWith(({ ci, migration }) => {
      delete ci[migration];
    });
    expect(error).toContain(
      `found no ci run on ${migration.slice(0, 7)} in GitHub's records`,
    );
    expect(error).not.toContain("did not pass");
  });

  it("says GitHub returned no jobs for a ci run whose jobs come back empty, not that checks did not pass", async () => {
    const { error, migration } = await stepWith(({ runs }) => {
      runs["12"] = { jobs: [] };
    });
    expect(error).toContain(
      `GitHub returned no jobs for ci's run on ${migration.slice(0, 7)} (https://example.invalid/runs/12)`,
    );
    expect(error).not.toContain("did not pass");
  });
});
