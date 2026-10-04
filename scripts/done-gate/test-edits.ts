// Which tests of a test file a change adds or edits: those whose lines, from the line a test starts on to where
// the brackets it opens close (test-span.ts), hold a line the change adds, or the place of a line it deletes, other
// than lines it only moved.

import type { Added } from "./diff";
import { git } from "./git";
import type { Snap } from "./snapshot";
import { testEnd } from "./test-span";

/**
 * PURE: did git see this added or removed line move? The done-rules item's moved-code detection marks such a line
 * `moved` in the snapshot ("moved lines, as the done-rules item detects them"); until it is on main, none is.
 */
export const movedLine = (l: Added) => "moved" in l && l.moved === true;

/**
 * For a test file the change leaves as `text`: whether the change touches it at all, and whether it touches the
 * test starting on line `start`.
 */
export function edits(snap: Snap, file: string, text: string) {
  const added = snap.added
    .filter((a) => a.file === file && !movedLine(a))
    .map((a) => a.line);
  const movedOut = new Set(
    snap.removed
      .filter((r) => r.file === file && movedLine(r))
      .map((r) => r.line),
  );
  // A deletion with nothing added in its place reads `@@ -<old>[,<count>] +<after>,0 @@`: it sits after line
  // <after>. One whose every line moved elsewhere is left out.
  const deleted = [
    ...git(
      snap.repo,
      [
        "--attr-source=4b825dc642cb6eb9a060e54bf8d69288fbee4904", // the change's attributes can't hide it
        "diff",
        "--unified=0",
        "--no-color",
        "--no-renames",
        "--no-ext-diff",
        "--no-textconv",
        snap.from,
        snap.tree,
        "--",
        file,
      ],
      {},
      true,
    ).matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+),0 @@/gm),
  ]
    .filter(([, old, count = "1"]) =>
      Array.from({ length: Number(count) }, (_, k) => Number(old) + k).some(
        (l) => !movedOut.has(l),
      ),
    )
    .map((m) => Number(m[3]));
  return {
    any: added.length + deleted.length > 0,
    touches: (start: number) => {
      const end = testEnd(text, start);
      return (
        added.some((l) => l >= start && l <= end) ||
        deleted.some((after) => after >= start && after < end)
      );
    },
  };
}
