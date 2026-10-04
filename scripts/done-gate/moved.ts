// Moved code: the lines a change only moves, inside a file or into another (one file split into several), as git's
// moved-code detection finds them (`--color-moved=blocks --color-moved-ws=allow-indentation-change`): a block of at
// least 20 letters and digits removed in one place and added unchanged, indentation aside, in another. A line edited
// on the way is not moved. A test moved whole into a file a test runner runs is no removal (removed-tests.ts) and
// Devesh is told each moved file and how many of its lines moved; every other done rule reads a moved line like any
// added one. A line's `moved` flag in the snapshot's added lines (numbered as the change leaves them) is "moved
// lines, as the done-rules item detects them", which the coverage and tests-proven items exempt.

import type { Added } from "./diff";

const ESC = "\u001b[";
const OLD_MOVED = `${ESC}35m`; // magenta, as COLOURS sets it
const NEW_MOVED = `${ESC}36m`; // cyan

/** git's settings before `diff`: colours fixed here, so a moved line is told by its first bytes, whatever git's config says. */
export const COLOURS = [
  "color.diff.old=red",
  "color.diff.new=green",
  "color.diff.oldMoved=magenta",
  "color.diff.newMoved=cyan",
  "color.diff.oldMovedAlternative=magenta",
  "color.diff.newMovedAlternative=cyan",
  "color.diff.meta=normal",
  "color.diff.frag=normal",
].flatMap((c) => ["-c", c]);
/** `diff`'s options: git detects moves only while it colours, and marks no whitespace inside a line. */
export const DETECT = [
  "--color=always",
  "--color-moved=blocks",
  "--color-moved-ws=allow-indentation-change",
  "--ws-error-highlight=none",
];

/** A line without the colour codes git writes before it. */
const plain = (l: string): string =>
  l.startsWith(ESC) && l.includes("m") ? plain(l.slice(l.indexOf("m") + 1)) : l;

/**
 * PURE: the same diff parseDiff read, coloured with COLOURS and DETECT, and its lines → those lines, each one git
 * painted moved marked `moved`. When the two runs disagree on how many lines changed, none is marked: a line is
 * moved only when git says so.
 */
export function withMoved(
  coloured: string,
  { added, removed }: { added: Added[]; removed: Added[] },
) {
  const flags = { added: [] as boolean[], removed: [] as boolean[] };
  let header = false;
  for (const raw of coloured.split("\n")) {
    const l = plain(raw);
    if (l.startsWith("diff --git ")) header = true;
    else if (/^@@ -\d+\S* \+\d+/.test(l)) header = false;
    else if (!header && l.startsWith("+"))
      flags.added.push(raw.startsWith(NEW_MOVED));
    else if (!header && l.startsWith("-"))
      flags.removed.push(raw.startsWith(OLD_MOVED));
  }
  if (
    added.length !== flags.added.length ||
    removed.length !== flags.removed.length
  )
    return { added, removed };
  const mark = (lines: Added[], moved: boolean[]) =>
    lines.map((l, i) => (moved[i] ? { ...l, moved: true } : l));
  return {
    added: mark(added, flags.added),
    removed: mark(removed, flags.removed),
  };
}

/** PURE: each file holding moved lines, in the diff's order, with how many moved in and out; undefined when none did. */
export function movedNote(files: string[], added: Added[], removed: Added[]) {
  const each = files.flatMap((f) => {
    const into = added.filter((a) => a.moved && a.file === f).length;
    const out = removed.filter((r) => r.moved && r.file === f).length;
    const ways = [into && `${into} in`, out && `${out} out`].filter(Boolean);
    return ways.length ? [`${f} ${ways.join(" and ")}`] : [];
  });
  return each.length ? `moved lines: ${each.join(", ")}` : undefined;
}
