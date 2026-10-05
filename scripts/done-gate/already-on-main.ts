// The mark a test carries when it deliberately checks behaviour main already has, `// behaviour already on main:
// <why>` at the end of the test's first line or alone on the comment line just above it. The marks are read from
// each test file as the change leaves it, on the tests the change adds or edits, whoever wrote the mark and
// whatever the file, so the check (tests-proven.ts), every stop (rules.ts) and the pull request's body (pr.ts) all
// see the same ones: a note at every stop and in CI's log, and a line of the body.

import { gitAnswer } from "./git";
import type { Snap } from "./snapshot";
import { edits } from "./test-edits";
import { isTestFile } from "./test-run";

const MARK = /\/\/\s*behaviour already on main:\s*(\S.*?)\s*$/i;

/** PURE: the reason a line's mark gives; a mark without one is no mark. */
export const markOn = (text: string) => text.match(MARK)?.[1];

/** A mark: its file and line, the line of the test it marks, and why. */
export type Mark = { file: string; line: number; start: number; why: string };

/**
 * PURE: the marks in a test file's text on the tests `touches` says the change adds or edits. A mark alone on a
 * comment line marks the test starting on the next line; any other marks the test starting on its own line.
 */
export const marksIn = (
  file: string,
  text: string,
  touches: (start: number) => boolean,
): Mark[] =>
  text.split("\n").flatMap((l, i) => {
    const why = markOn(l);
    const start = /^\s*\/\//.test(l) ? i + 2 : i + 1;
    return why && touches(start) ? [{ file, line: i + 1, start, why }] : [];
  });

/** The marks on the tests the change adds or edits, in every test file it leaves. */
export const changeMarks = (snap: Snap): Mark[] =>
  snap.files.filter(isTestFile).flatMap((f) => {
    const blob = gitAnswer(snap.repo, [
      "cat-file",
      "blob",
      `${snap.tree}:${f}`,
    ]);
    return blob.status === 0
      ? marksIn(f, blob.stdout, edits(snap, f, blob.stdout).touches)
      : []; // the change deletes it
  });

/** PURE: what Devesh is shown for a mark. */
export const markNote = (m: Mark) =>
  `test marked "behaviour already on main" at ${m.file}:${m.line}: ${m.why}`;

/** PURE: a problem for each mark the pull request's body, as GitHub shows it, doesn't copy. */
export const markBodyProblems = (marks: Mark[], body: string) => {
  const lines = body
    .split(/\r?\n/)
    .filter((l) => l.startsWith("Behaviour already on main:"));
  return marks
    .filter((m) => !lines.some((l) => l.includes(m.file) && l.includes(m.why)))
    .map(
      (m) =>
        `the PR body doesn't show the test marked "behaviour already on main" at ${m.file}:${m.line}: add the line \`Behaviour already on main: ${m.file} · ${m.why}\``,
    );
};
