// Main's rules-from-main workflow (.github/workflows/rules-from-main.yml), run in a scratch copy as GitHub runs it
// for a pull request: its trigger, its checkout and each of its `run` steps as main's copy of the file writes them,
// so a proof step shows what judges a branch, not only what main's copy of the rules says when asked by hand.

import { join } from "node:path";
import { PR } from "./gate";
import { git, sh } from "./scratch";

const WORKFLOW = ".github/workflows/rules-from-main.yml";
type Workflow = {
  on?: string | string[] | Record<string, unknown>;
  jobs?: Record<
    string,
    {
      steps?: { uses?: string; with?: Record<string, unknown>; run?: string }[];
    }
  >;
};

/**
 * Main's rules-from-main.yml on pull request 9999, whose head is `head` in the clone `dir` and whose body is `body`.
 * GitHub runs main's copy of a workflow file only for `pull_request_target`, so the file must start on that alone
 * (else this throws, saying GitHub would run the branch's copy); then its steps run in a clone of main, from an
 * origin in `base` that holds the pull request as refs/pull/9999/head: the checkout as its `ref` names it, and each
 * `run` step as written, with the pull request's number, head and body. The exit status of the first step that
 * failed (0 when none did) and what the steps printed.
 */
export function byWorkflow(
  dir: string,
  base: string,
  head: string,
  body: string,
) {
  const file = Bun.YAML.parse(git(dir, "show", `main:${WORKFLOW}`)) as Workflow;
  const on =
    typeof file.on === "string"
      ? [file.on]
      : Array.isArray(file.on)
        ? file.on
        : Object.keys(file.on ?? {});
  if (on.join() !== "pull_request_target")
    throw new Error(
      `main's ${WORKFLOW} starts on ${on.join(", ") || "nothing"}: only \`pull_request_target\` makes GitHub run main's copy of it rather than the branch's`,
    );
  const steps = Object.values(file.jobs ?? {}).flatMap((j) => j.steps ?? []);
  const ref = steps.find((s) => s.uses?.startsWith("actions/checkout@"))?.with
    ?.ref;
  if (ref !== "main")
    throw new Error(
      `main's ${WORKFLOW} checks out ${ref ? String(ref) : "the pull request's commit"}, not main`,
    );
  const origin = join(base, "origin.git");
  const judge = join(base, "judge");
  git(base, "init", "-q", "--bare", origin);
  git(
    origin,
    "fetch",
    "-q",
    dir,
    "main:refs/heads/main",
    `${head}:refs/pull/${PR}/head`,
  );
  git(base, "clone", "-q", "--branch", "main", origin, judge);
  const env = {
    PR_NUMBER: PR,
    HEAD_SHA: git(dir, "rev-parse", head),
    PR_BODY: body,
  };
  let out = "";
  for (const { run } of steps)
    if (run) {
      // GitHub's own shell for a `run` step on Linux
      const r = sh(
        judge,
        ["bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", run],
        env,
      );
      out += r.out;
      if (r.status !== 0) return { status: r.status, out };
    }
  return { status: 0, out };
}
