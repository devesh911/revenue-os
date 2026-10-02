// What main's copy of the rules judges about a pull request (`bun run gate pr`, which rules-from-main runs on
// every pull request with --head): the done rules, each rule change explained and recorded, and no other workflow
// able to report a check named rules-from-main.

import { git } from "./git";
import { migrationProblems } from "./migrations";
import { ruleChangeProblems } from "./rule-changes";
import { rulesOn } from "./rules";
import type { Snap } from "./snapshot";

const WORKFLOWS = ".github/workflows/";
const OURS = `${WORKFLOWS}rules-from-main.yml`;
const NAME = "rules-from-main";
type Job = { name?: unknown; permissions?: unknown };

/** Can a job's token write checks or statuses? `write-all`, either scope at write, or no permissions anywhere. */
const writesChecks = (permissions: unknown) =>
  permissions === undefined ||
  permissions === "write-all" ||
  (typeof permissions === "object" &&
    permissions !== null &&
    ["checks", "statuses"].some(
      (k) => (permissions as Record<string, unknown>)[k] === "write",
    ));

/**
 * PURE: the pull request's workflow files → problems when any besides ours could report a check named
 * rules-from-main, which main's ruleset requires: a job of that id or name (read as YAML, so quoting, anchors and
 * folded text change nothing), a job whose name is an expression, which can't be read until it runs, or a job whose
 * token can write checks or statuses. Ours must hold exactly one job, of that id.
 */
export function secondCheck(workflows: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const [file, text] of Object.entries(workflows)) {
    try {
      const doc = Bun.YAML.parse(text) as {
        jobs?: Record<string, Job>;
        permissions?: unknown;
      } | null;
      const jobs = doc?.jobs ?? {};
      if (file !== OURS)
        for (const [id, job] of Object.entries(jobs)) {
          const name = String(job?.name ?? id);
          if (
            [id, name].some((n) => n.toLowerCase() === NAME) ||
            /\$\{\{/.test(name)
          )
            problems.push(
              `${file}, job ${id}: its check could be named ${NAME}, the name only ${OURS} may report (a job's name must be plain text)`,
            );
          if (writesChecks(job?.permissions ?? doc?.permissions))
            problems.push(
              `${file}, job ${id}: its token could write checks or statuses, and so report a check named ${NAME}; give it permissions without checks or statuses write`,
            );
        }
      else if (Object.keys(jobs).join() !== NAME)
        problems.push(`${OURS} must hold exactly one job, ${NAME}`);
    } catch (e) {
      problems.push(
        `${file} can't be read as YAML (${String(e).split("\n")[0]}), so its checks can't be judged`,
      );
    }
  }
  return problems;
}

/** The snapshot's code, read from git: a file the change leaves (empty when it has none). */
const at = (snap: Snap, file: string) =>
  git(snap.repo, ["cat-file", "blob", `${snap.tree}:${file}`], {}, true);

export function judgePr(snap: Snap, body: string, pr?: string) {
  const { problems, notes } = rulesOn(snap);
  const workflows = Object.fromEntries(
    git(
      snap.repo,
      ["ls-tree", "-r", "-z", "--name-only", snap.tree, "--", WORKFLOWS],
      {},
      true,
    )
      .split("\0")
      .filter((f) => /\.ya?ml$/i.test(f))
      .map((f) => [f, at(snap, f)]),
  );
  return {
    problems: [
      ...problems,
      ...ruleChangeProblems(
        snap.files,
        snap.added,
        body,
        at(snap, "STATE.md"),
        pr,
        snap.removed,
      ),
      ...secondCheck(workflows),
      ...migrationProblems(snap),
    ],
    notes,
  };
}
