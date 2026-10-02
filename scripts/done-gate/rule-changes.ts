// A pull request that changes a rule file says in its body which rule changed, which way and why, and adds the
// same to STATE.md → Rule changes, which only grows (AGENTS.md hard rail 7).

import type { Added } from "./diff";
import { RULE_FILES } from "./rules";

const WAY = "tighter|looser|neutral|mixed";
const SAID = new RegExp(`^Rule change: (.+?) · (?:${WAY}) · \\S`);
// `- YYYY-MM-DD · [#N](link) · which rule · direction`, as the section's own first paragraph gives it.
const RECORDED = new RegExp(
  `^- \\d{4}-\\d{2}-\\d{2} · \\[#(\\d+)\\]\\(https://github\\.com/[\\w.-]+/[\\w.-]+/pull/\\1\\) · (.+) · (?:${WAY})\\b`,
);
const HOW = `\`Rule change: <rule> · tighter | looser | neutral | mixed · <why>\`, where <rule> names the file by its path, its file name or the folder it sits in (such as scripts/done-gate/)`;

/**
 * PURE: does `text` name `file` by its path, its file name, or the folder it sits in written with its "/", each as
 * a whole word? A folder further up names nothing: ".github/" does not name .github/workflows/ci.yml.
 */
export const names = (text: string, file: string) => {
  const at = file.lastIndexOf("/");
  return [
    file,
    file.slice(at + 1),
    ...(at > 0 ? [file.slice(0, at + 1)] : []),
  ].some((n) =>
    new RegExp(
      `(?<![\\w./-])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/-])`,
    ).test(text),
  );
};

/** PURE: a PR body as GitHub shows it: no HTML comments, no fenced code blocks, where a line could hide. */
export const shown = (body: string) =>
  body
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/^ {0,3}(```|~~~)[\s\S]*?(?:^ {0,3}\1|(?![\s\S]))/gm, "");

/**
 * PURE: the change's files, added and removed lines, the PR body, STATE.md as the change leaves it, and the PR's
 * number when known → what is missing for each changed rule file (a line in the body, as GitHub shows it, saying
 * how it changed and why, and a line the change adds to STATE.md → Rule changes for this PR), and any record of an
 * earlier rule change the change removes or rewrites.
 */
export function ruleChangeProblems(
  files: string[],
  added: Added[],
  body: string,
  state: string,
  pr?: string,
  removed: Added[] = [],
): string[] {
  const problems = removed
    .filter((r) => r.file === "STATE.md" && RECORDED.test(r.text))
    .map(
      (r) =>
        `STATE.md → Rule changes only grows: this change removes or rewrites the record "${r.text}"`,
    );
  const changed = files.filter((f) => RULE_FILES.test(f));
  if (!changed.length) return problems;
  const said = shown(body)
    .split(/\r?\n/)
    .filter((l) => l.startsWith("Rule change:"));
  for (const l of said)
    if (!SAID.test(l))
      problems.push(`the PR body's line "${l}" is not written as ${HOW}`);
  const rules = said.map((l) => l.match(SAID)?.[1] ?? "");
  const lines = state.split("\n");
  const from = lines.indexOf("## Rule changes") + 1; // its line number; 0 when the heading is missing
  const to = lines.findIndex((l, i) => i >= from && /^## /.test(l));
  const records = added
    .filter(
      (a) =>
        from &&
        a.file === "STATE.md" &&
        a.line > from &&
        (to < 0 || a.line <= to) &&
        a.text.startsWith("- "),
    )
    .map((a) => ({ text: a.text, m: a.text.match(RECORDED) }));
  for (const { text, m } of records)
    if (!m)
      problems.push(
        `STATE.md → Rule changes: "${text}" is not \`- YYYY-MM-DD · [#N](link) · <rule> · tighter | looser | neutral | mixed\``,
      );
    else if (pr && m[1] !== pr)
      problems.push(
        `STATE.md → Rule changes: "${text}" names #${m[1]}, not this pull request (#${pr})`,
      );
  const mine = records.flatMap(({ m }) =>
    m && (!pr || m[1] === pr) ? [m[2] ?? ""] : [],
  );
  const unsaid = changed.filter((f) => !rules.some((r) => names(r, f)));
  if (unsaid.length)
    problems.push(
      `the PR body explains no change to ${unsaid.join(", ")}: add one line per changed rule, ${HOW}`,
    );
  const unrecorded = changed.filter((f) => !mine.some((r) => names(r, f)));
  if (unrecorded.length)
    problems.push(
      `STATE.md → Rule changes gains no line${pr ? ` for #${pr}` : ""} naming ${unrecorded.join(", ")}: add one per changed rule, \`- YYYY-MM-DD · [#N](link) · <rule> · <direction>\`, naming each file as the PR body does`,
    );
  return problems;
}
