// What main's copy of the rules judges about a pull request (`bun run gate pr`, which rules-from-main runs on
// every pull request with --head): the done rules, each rule change explained and recorded, and no second
// check named rules-from-main.

import { git } from "./git";
import { ruleChangeProblems } from "./rule-changes";
import { rulesOn } from "./rules";
import type { Snap } from "./snapshot";

const WORKFLOWS = ".github/workflows/";
const OURS = `${WORKFLOWS}rules-from-main.yml`;
// A job whose id or name is rules-from-main: GitHub reports either as the check's name.
const NAMED =
  /^ {2}rules-from-main:\s*(?:#.*)?$|^\s+name:\s*["']?rules-from-main["']?\s*(?:#.*)?$/gm;

/** PURE: the pull request's workflow files → a problem when one besides ours defines a check named rules-from-main. */
export function secondCheck(workflows: Record<string, string>) {
  const where = Object.entries(workflows).flatMap(([file, text]) =>
    (text.match(NAMED) ?? []).map(() => file),
  );
  if (where.length > 1 || where.some((f) => f !== OURS))
    return `a check named rules-from-main is defined ${where.length} times (${where.join(", ")}); only ${OURS}'s one job may carry that name, which main's ruleset requires`;
}

/** The snapshot's code, read from git: a file the change leaves (empty when it has none) and the workflow files. */
const at = (snap: Snap, file: string) =>
  git(snap.repo, ["cat-file", "blob", `${snap.tree}:${file}`], {}, true);

export function judgePr(snap: Snap, body: string, pr?: string) {
  const { problems, notes } = rulesOn(snap);
  const workflows = Object.fromEntries(
    git(
      snap.repo,
      ["ls-tree", "-r", "--name-only", snap.tree, "--", WORKFLOWS],
      {},
      true,
    )
      .split("\n")
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => [f, at(snap, f)]),
  );
  const second = secondCheck(workflows);
  return {
    problems: [
      ...problems,
      ...ruleChangeProblems(
        snap.files,
        snap.added,
        body,
        at(snap, "STATE.md"),
        pr,
      ),
      ...(second ? [second] : []),
    ],
    notes,
  };
}
