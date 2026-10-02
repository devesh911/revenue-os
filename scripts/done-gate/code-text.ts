// Reading code as text: comments dropped, a statement the formatter wrapped over several lines joined back,
// and the names an added line exports.

import type { Added } from "./diff";

const EXPORT =
  /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/;
/** PURE: the names an added line exports: one declaration, "default", or each name of `export { a, b as c }`. */
export const exportsOf = (text: string): string[] => {
  const one = text.match(EXPORT)?.[1];
  if (one) return [one];
  if (/^export\s+default\b/.test(text)) return ["default"];
  const list = text.match(/^export\s*\{([^}]*)\}\s*;?\s*$/)?.[1] ?? "";
  return list
    .split(",")
    .map(
      (s) =>
        s
          .trim()
          .split(/\s+as\s+/)
          .at(-1) ?? "",
    )
    .filter((n) => /^[\w$]+$/.test(n));
};

/**
 * PURE: code without comments, read in one pass so "image/*" stays a string. A comment starts a line or follows
 * a space, "{" or "(", so a regex such as /a\// hides nothing; one left open runs to the end. A quote right after
 * a letter is an apostrophe in JSX text (Don't), never a string. `blank` empties "…" and '…' too; `…` stays, it
 * holds ${uses}.
 */
export const uncommented = (source: string, blank = false) =>
  source.replace(
    /(?<![\w$])(["'])(?:\\.|(?!\1)[^\\\n])*\1|`(?:\\[\s\S]|[^\\`])*`|(?<![^\s{(])\/\*[\s\S]*?(?:\*\/|$)|(?<![^\s{(])\/\/.*/g,
    (m) => (m[0] === "/" ? "" : blank && m[0] !== "`" ? '""' : m),
  );

/**
 * PURE: the added line at `i` as code (comments dropped), joined with the added lines that continue it when it
 * opens a throw or an `export {` list, which the formatter wraps over several lines; and those lines as written.
 */
export function statementAt(added: Added[], i: number) {
  const a = added[i];
  const lines = [a?.text ?? ""];
  const bare = (t: string) => uncommented(t, true).trim(); // no comments, strings emptied
  if (
    a &&
    (/\bthrow\b/.test(bare(a.text)) || /^export\s*\{[^}]*$/.test(bare(a.text)))
  )
    for (
      let j = i + 1;
      j < i + 40 &&
      !bare(lines.join("\n")).endsWith(";") &&
      added[j]?.file === a.file &&
      added[j]?.line === (added[j - 1]?.line ?? 0) + 1;
      j++
    )
      lines.push(added[j]?.text ?? "");
  return { code: lines.map((l) => uncommented(l).trim()).join(" "), lines };
}
