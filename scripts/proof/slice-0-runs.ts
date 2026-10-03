// Slice 0's proof: GitHub's run records show that on main the cloud test database changes only after the tests pass.
// Each recent run of staging-migrations on main must have started after ci's `checks` job passed on the same commit,
// and must have skipped its apply step when that commit changed no migration. Read with `gh run list` and `gh run view`
// (reads only, with the run's GitHub token); a record that can't be read fails the step, saying why.

import { spawnSync } from "node:child_process";
import { git, plainEnv } from "./scratch";
import type { Step } from "./step";

const STAGING = "staging-migrations.yml";
const APPLY = "Apply migrations to staging";
const RECENT = 10; // runs of staging-migrations judged

type Job = {
  name: string;
  conclusion: string | null;
  startedAt?: string;
  completedAt?: string;
  steps?: { name: string; conclusion: string | null }[];
};
export type StagingRun = { url: string; sha: string; jobs: Job[] };
export type CiRun = { sha: string; jobs: Job[] };

/**
 * PURE: recent staging-migrations runs on main, ci's runs on main and whether a commit changed a migration → what
 * the records show wrong. A run whose job was skipped (ci failed) never reached the cloud, so only the others are
 * held to it; at least one of those must show the skip on a commit that changed no migration.
 */
export function runRecordProblems(
  staging: StagingRun[],
  ci: CiRun[],
  changedMigration: (sha: string) => boolean,
): string[] {
  const ran = staging.flatMap((run) =>
    run.jobs
      .filter((j) => j.conclusion !== "skipped")
      .map((job) => ({ run, job })),
  );
  if (!ran.length)
    return [
      `no run of staging-migrations on main ran its job in the last ${RECENT}, so nothing shows when it changes the cloud test database`,
    ];
  const problems: string[] = [];
  let skippedClean = 0;
  for (const { run, job } of ran) {
    const short = run.sha.slice(0, 7);
    const checks = ci
      .filter((c) => c.sha === run.sha)
      .flatMap((c) => c.jobs)
      .find((j) => j.name === "checks" && j.conclusion === "success");
    if (!checks?.completedAt)
      problems.push(
        `${run.url}: \`checks\` did not pass on ${short}, yet the job ran`,
      );
    else if (Date.parse(job.startedAt ?? "") < Date.parse(checks.completedAt))
      problems.push(
        `${run.url}: started at ${job.startedAt}, before \`checks\` passed on ${short} at ${checks.completedAt}`,
      );
    const apply = job.steps?.find((s) => s.name === APPLY)?.conclusion;
    if (!changedMigration(run.sha)) {
      if (apply === "skipped") skippedClean++;
      else
        problems.push(
          `${run.url}: ${short} changed no migration, yet its step "${APPLY}" ${apply ? `ended ${apply}` : "is missing"}`,
        );
    }
  }
  if (!skippedClean)
    problems.push(
      "no run on a commit that changed no migration, so none shows the apply step skipped",
    );
  return problems;
}

/** gh's answer as JSON, or an error saying why GitHub's records could not be read. */
function gh<T>(root: string, env: NodeJS.ProcessEnv, args: string[]): T {
  const r = spawnSync("gh", args, {
    cwd: root,
    encoding: "utf8",
    env: plainEnv({ GH_TOKEN: env.GH_TOKEN }),
  });
  if (r.status !== 0)
    throw new Error(
      `could not read GitHub's run records (gh ${args.slice(0, 2).join(" ")}): ${(r.stderr || String(r.error)).trim().split("\n")[0]}`,
    );
  return JSON.parse(r.stdout) as T;
}

const repoOf = (env: NodeJS.ProcessEnv) =>
  env.GITHUB_REPOSITORY ? ["-R", env.GITHUB_REPOSITORY] : [];

export const runRecords: Step = {
  does: `Reads GitHub's run records (gh run list and gh run view, reads only) of the last ${RECENT} staging-migrations runs on main and of ci, and checks that the step that updates the cloud test database starts only after \`checks\` has passed on the same commit and is skipped when no migration changed`,
  check: ({ root, env }) => {
    const R = repoOf(env);
    type Listed = { databaseId: number; headSha: string; url: string };
    const list = (workflow: string, limit: number) =>
      gh<Listed[]>(root, env, [
        "run",
        "list",
        ...R,
        "--workflow",
        workflow,
        "--branch",
        "main",
        "--status",
        "completed",
        "--limit",
        String(limit),
        "--json",
        "databaseId,headSha,url",
      ]);
    const jobs = (id: number) =>
      gh<{ jobs: Job[] }>(root, env, [
        "run",
        "view",
        ...R,
        String(id),
        "--json",
        "jobs",
      ]).jobs;
    const staging = list(STAGING, RECENT).map((r) => ({
      url: r.url,
      sha: r.headSha,
      jobs: jobs(r.databaseId),
    }));
    const shas = new Set(staging.map((r) => r.sha));
    const ci = list("ci.yml", 100)
      .filter((r) => shas.has(r.headSha))
      .map((r) => ({ sha: r.headSha, jobs: jobs(r.databaseId) }));
    const changed = (sha: string) => {
      try {
        return !!git(
          root,
          "diff",
          "--name-only",
          `${sha}^`,
          sha,
          "--",
          "supabase/migrations",
        );
      } catch {
        return true; // a commit this checkout lacks is held to nothing it can't see
      }
    };
    const problems = runRecordProblems(staging, ci, changed);
    if (problems.length) throw new Error(problems.join("\n"));
    const ran = staging.filter((r) =>
      r.jobs.some((j) => j.conclusion !== "skipped"),
    );
    return `of the last ${staging.length} runs on main, the ${ran.length} that ran started after \`checks\` passed on their commit, and ${ran.filter((r) => !changed(r.sha)).length} of them, on commits that changed no migration, skipped the apply step; ${staging.length - ran.length} skipped its job, as it does when ci did not pass (newest: ${staging[0]?.url})`;
  },
};
