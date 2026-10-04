// Moved lines: the lines a change only moves, inside a file or into another (one file split into several), as git's
// moved-code detection finds them (`git diff --color-moved=blocks --color-moved-ws=allow-indentation-change`, the
// detection the done-rules item names): a block of at least 20 letters and digits removed in one place and added
// unchanged, indentation aside, in another. A line edited on the way is not moved. The coverage rule asks no test of a
// moved line. The done-rules item builds the same detection into the snapshot; the pull request of the two that lands
// second makes the coverage rule use that one and deletes this file.

import type { Added } from "./diff";
import { git } from "./git";
import type { Snap } from "./snapshot";

const ESC = "\u001b[";
const NEW_MOVED = `${ESC}36m`; // cyan: how COLOURED paints an added line git saw move
/** The snapshot's own diff again (snapshot.ts), coloured to show which lines moved, whatever git's config says. */
const COLOURED = [
  "--attr-source=4b825dc642cb6eb9a060e54bf8d69288fbee4904", // the empty tree: the change's .gitattributes hide nothing
  ...[
    "color.diff.new=green",
    "color.diff.newMoved=cyan",
    "color.diff.newMovedAlternative=cyan",
    "color.diff.meta=normal",
    "color.diff.frag=normal",
  ].flatMap((c) => ["-c", c]),
  "diff",
  "--no-textconv",
  "--unified=0",
  "--no-renames",
  "--no-ext-diff",
  "--color=always",
  "--color-moved=blocks",
  "--color-moved-ws=allow-indentation-change",
  "--ws-error-highlight=none",
];

/**
 * PURE: the coloured diff and the added lines the same diff gave without colour, in order → the added lines git
 * painted moved, as "line file". When the two disagree on how many lines were added, none: a line moved only when
 * git says so.
 */
function movedIn(coloured: string, added: Added[]): Set<string> {
  const flags: boolean[] = [];
  let header = false;
  for (const raw of coloured.split("\n")) {
    let l = raw; // without the colour codes git writes before it
    while (l.startsWith(ESC) && l.includes("m"))
      l = l.slice(l.indexOf("m") + 1);
    if (l.startsWith("diff --git ")) header = true;
    else if (/^@@ -\d+\S* \+\d+/.test(l)) header = false;
    else if (!header && l.startsWith("+"))
      flags.push(raw.startsWith(NEW_MOVED));
  }
  if (flags.length !== added.length) return new Set();
  return new Set(
    added.filter((_, i) => flags[i]).map((a) => `${a.line} ${a.file}`),
  );
}

/** The checkout's change → isMoved(file, line): did git see that added line only move there? */
export function movedLines(snap: Snap) {
  const moved = movedIn(
    git(snap.repo, [...COLOURED, snap.from, snap.tree], {}, true),
    snap.added,
  );
  return (file: string, line: number) => moved.has(`${line} ${file}`);
}
