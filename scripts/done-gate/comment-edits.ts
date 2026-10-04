// Lines whose code a change keeps as it was: a hunk (a run of changed lines) whose every line keeps its code and
// changes only its comment, the way docs/fix-when-touched.md asks a change to repoint an old code in a comment, adds
// no code, so the coverage rule asks no test of it. Lines pair in order within their hunk, so a hunk that changes any
// line's code, or adds or removes a line, is judged whole.

import { uncommented } from "./code-text";
import type { Added } from "./diff";

/** PURE: one file's changed lines, in order → runs of consecutive line numbers. */
function runsOf(lines: Added[]): Added[][] {
  const runs: Added[][] = [];
  for (const l of lines) {
    const last = runs.at(-1);
    if (last && (last.at(-1)?.line ?? 0) + 1 === l.line) last.push(l);
    else runs.push([l]);
  }
  return runs;
}

const code = (l: Added) => uncommented(l.text).trim();

/**
 * PURE: the change's added and removed lines (`git diff --unified=0`, where a hunk's removed lines start at old line r
 * and its added lines at new line r plus the lines earlier hunks added less those they removed) → isCommentEdit(file,
 * line): is that added line in a hunk that changes comments only?
 */
export function commentEdits(added: Added[], removed: Added[]) {
  const kept = new Set<string>();
  for (const file of new Set(added.map((a) => a.file))) {
    const gone = runsOf(removed.filter((r) => r.file === file));
    let delta = 0; // lines the hunks so far added, less those they removed
    let i = 0;
    for (const run of runsOf(added.filter((a) => a.file === file))) {
      const start = run[0]?.line ?? 0;
      let old = gone[i];
      while (old && (old[0]?.line ?? 0) + delta < start) {
        delta -= old.length; // a hunk that only removes lines
        old = gone[++i];
      }
      if (old && (old[0]?.line ?? 0) + delta === start) {
        if (
          old.length === run.length &&
          old.every((r, k) => code(r) === code(run[k] as Added))
        )
          for (const a of run) kept.add(`${a.line} ${file}`);
        delta -= old.length;
        i++;
      }
      delta += run.length;
    }
  }
  return (file: string, line: number) => kept.has(`${line} ${file}`);
}
