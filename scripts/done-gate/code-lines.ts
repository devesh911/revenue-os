// A file's code line by line, its comments dropped and its line numbers kept: what the coverage rule judges in a file
// no test loads, and where the migration check looks for a name, so a comment never counts as code or as a use.

import { uncommented } from "./code-text";

const MARK = String.fromCharCode(0xe000); // from Unicode's private-use area, so never part of code
const NUMBERED = new RegExp(`${MARK}(\\d+)${MARK}\\n([^${MARK}]*)`, "g");

/** PURE: source → its lines without their comments (a block comment's inner lines left empty), strings kept. */
export function codeLines(source: string): string[] {
  const lines = source.split("\n");
  // Each line follows a numbered marker line, and a comment that uncommented drops takes the markers inside it along.
  const kept = uncommented(
    lines.map((l, i) => `${MARK}${i}${MARK}\n${l}`).join("\n"),
  );
  // A line whose marker went sits inside a block comment: only what follows the comment's end, if it ends there, is code.
  const code = lines.map((l) =>
    l.includes("*/") ? uncommented(l.slice(l.lastIndexOf("*/") + 2)) : "",
  );
  for (const [, n, text] of kept.matchAll(NUMBERED))
    code[Number(n)] = (text ?? "").replace(/\n$/, "");
  return code;
}

/** PURE: does this code hold anything that runs on its own? Brackets, commas and semicolons alone do not; `(` calls. */
export const holdsCode = (code: string) => /[^\s{}[\];,)]/.test(code);
