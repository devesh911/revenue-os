// What main's copy of the rules judges about a pull request (`bun run gate pr`, which rules-from-main runs on
// every pull request with --head): the body's first line, the done rules, each rule change explained and recorded,
// each fix-when-touched entry it touches answered, and no other workflow able to report a check named rules-from-main.

import { fixWhenTouchedProblems, TABLE, unreadTable } from "./fix-when-touched";
import { git } from "./git";
import { firstLineProblems } from "./pr-first-line";
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

/** `base` is main: its fix-when-touched table judges, never the branch's, and its ROADMAP.md says what is finished. */
export function judgePr(
  snap: Snap,
  body: string,
  pr?: string,
  base = "origin/main",
) {
  const { problems, notes } = rulesOn(snap);
  const onBase = (file: string) =>
    git(snap.repo, ["cat-file", "blob", `${base}:${file}`], {}, true);
  const table = onBase(TABLE);
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
      ...firstLineProblems(
        body,
        at(snap, "ROADMAP.md"),
        onBase("ROADMAP.md"),
        snap.files.includes("ROADMAP.md"),
      ),
      ...problems,
      ...ruleChangeProblems(
        snap.files,
        snap.added,
        body,
        at(snap, "STATE.md"),
        pr,
        snap.removed,
      ),
      ...fixWhenTouchedProblems(snap.files, body, table),
      ...secondCheck(workflows),
    ],
    notes: [...notes, ...unreadTable(table)],
  };
}
