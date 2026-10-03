// Which tests of a test file a change adds or edits: those whose lines, from the line a test starts on to where
// the brackets it opens close (test-span.ts), hold a line the change adds, other than one it only moved, or the
// place of a line it deletes.

import { git } from "./git";
import type { Snap } from "./snapshot";
import { testEnd } from "./test-span";

/** Is this added line one the change only moved (the done-rules item's moved-code detection)? */
export type IsMoved = (file: string, line: number) => boolean;

/**
 * For a test file the change leaves as `text`: whether the change touches it at all, and whether it touches the
 * test starting on line `start`.
 */
export function edits(
  snap: Snap,
  file: string,
  text: string,
  isMoved: IsMoved = () => false,
) {
  const added = snap.added
    .filter((a) => a.file === file && !isMoved(file, a.line))
    .map((a) => a.line);
  // A deletion with nothing added in its place reads `@@ -<old> +<after>,0 @@`: it sits after line <after>.
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
    ).matchAll(/^@@ -\S+ \+(\d+),0 @@/gm),
  ].map((m) => Number(m[1]));
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
