// A pull request that changes a file the "Find your area" table of docs/fix-when-touched.md covers answers, in its
// body, each entry that covers it: fixed, or why it doesn't apply. The table is read as main has it, so a branch
// that edits the table changes what later pull requests are asked, never what it is asked itself.

import { shown } from "./rule-changes";

export const TABLE = "docs/fix-when-touched.md";
const SAID = /^Fix-when-touched: (\d+) · (?:fixed|not applicable) · \S/;
const HOW =
  "`Fix-when-touched: <entry number> · fixed · <what you fixed>` or `Fix-when-touched: <entry number> · not applicable · <why>`";

/** PURE: the table's rows → each entry's number and title (right column) and the paths in backticks (left column). */
export function areasOf(md: string) {
  const [, after = ""] = md
    .replace(/\r\n?/g, "\n")
    .split("## Find your area\n");
  const [table = ""] = after.split("\n## ");
  return table.split("\n").flatMap((l) => {
    const [left = "", right = ""] = l.split("|").slice(1, -1);
    const [, n, title] = right.trim().match(/^(\d+)\.\s*(.+)$/) ?? [];
    return n && title
      ? [
          {
            n,
            title,
            paths: [...left.matchAll(/`([^`]+)`/g)].map((p) => p[1] ?? ""),
          },
        ]
      : [];
  });
}

/** PURE: does a path of the table (a folder ending in "/", or a file) cover `file`, at any letter case? */
const covers = (path: string, file: string) =>
  path.endsWith("/")
    ? file.toLowerCase().startsWith(path.toLowerCase())
    : file.toLowerCase() === path.toLowerCase();

/**
 * PURE: the change's files, the PR body and the table as main has it → each entry covering a changed file that no
 * line of the body, as GitHub shows it, answers, naming those files; and each `Fix-when-touched:` line not in the format.
 */
export function fixWhenTouchedProblems(
  files: string[],
  body: string,
  table: string,
): string[] {
  const said = shown(body)
    .split(/\r?\n/)
    .filter((l) => l.startsWith("Fix-when-touched:"));
  const answered = said.map((l) => l.match(SAID)?.[1]);
  const problems = said
    .filter((l) => !SAID.test(l))
    .map((l) => `the PR body's line "${l}" is not written as ${HOW}`);
  for (const { n, title, paths } of areasOf(table)) {
    const hit = files.filter((f) => paths.some((p) => covers(p, f)));
    if (hit.length && !answered.includes(n))
      problems.push(
        `${TABLE} entry ${n} (${title}) covers ${hit.join(", ")}: add the line \`Fix-when-touched: ${n} · fixed · <what you fixed>\` or \`Fix-when-touched: ${n} · not applicable · <why>\` to the PR body`,
      );
  }
  return problems;
}
