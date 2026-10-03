// The mark a test carries when it deliberately checks behaviour main already has, `// behaviour already on main:
// <why>` on its first line or the comment line above it, and how Devesh sees each one: a note at every stop and in
// CI's log, and a line of the pull request's body.

import type { Added } from "./diff";
import { isTestFile } from "./test-run";

const MARK = /\/\/\s*behaviour already on main:\s*(\S.*?)\s*$/i;

/** PURE: the reason a line's mark gives; a mark without one is no mark. */
export const markOn = (text: string) => text.match(MARK)?.[1];

/** PURE: what Devesh is shown for a mark. */
export const markNote = (file: string, line: number, why: string) =>
  `test marked "behaviour already on main" at ${file}:${line}: ${why}`;

/** The marks among the change's added lines, in test files. The gate's own files quote the mark, so they don't count. */
const marksIn = (added: Added[]) =>
  added.flatMap((a) => {
    const why =
      isTestFile(a.file) && !a.file.startsWith("scripts/done-gate")
        ? markOn(a.text)
        : undefined;
    return why ? [{ ...a, why }] : [];
  });

/** PURE: a note for each mark the change adds. */
export const markNotes = (added: Added[]) =>
  marksIn(added).map((m) => markNote(m.file, m.line, m.why));

/**
 * PURE: the change's added lines and its pull request's body as GitHub shows it → a problem for each mark the body
 * doesn't copy as `Behaviour already on main: <file> · <why>`.
 */
export const markBodyProblems = (added: Added[], body: string) => {
  const lines = body
    .split(/\r?\n/)
    .filter((l) => l.startsWith("Behaviour already on main:"));
  return marksIn(added)
    .filter((m) => !lines.some((l) => l.includes(m.file) && l.includes(m.why)))
    .map(
      (m) =>
        `the PR body doesn't show the test marked "behaviour already on main" at ${m.file}:${m.line}: add the line \`Behaviour already on main: ${m.file} · ${m.why}\``,
    );
};
