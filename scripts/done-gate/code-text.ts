// Reading code as text: comments dropped, a statement the formatter wrapped over several lines joined back, a
// name inside a multi-line export list read as an export of its own, and the names an added line exports.

import type { Added } from "./diff";

const EXPORT =
  /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/;
/**
 * PURE: the names an added line exports: one declaration, "default", each name of `export { a, b as c }` (with or
 * without `from`), the namespace of `export * as ns from`, or, for `export * from "./m"`, `* from ./m`: every name m
 * exports, passed on.
 */
export const exportsOf = (text: string): string[] => {
  const one = text.match(EXPORT)?.[1];
  if (one) return [one];
  if (/^export\s+default\b/.test(text)) return ["default"];
  const star = text.match(
    /^export\s*\*\s*(?:as\s+([\w$]+)\s*)?from\s*["']([^"']+)["']/,
  );
  if (star) return [star[1] ?? `* from ${star[2]}`];
  const list =
    text.match(
      /^export\s*\{([^}]*)\}\s*(?:from\s*["'][^"']+["']\s*)?;?\s*$/,
    )?.[1] ?? "";
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
 * A line added inside a list the change did not open is the statement it adds alone, its `within`.
 */
export function statementAt(added: Added[], i: number) {
  const a = added[i];
  if (a?.within) return { code: a.within, lines: [a.text] };
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

/**
 * PURE: a file's text → for each line of a multi-line `export { … }` list after its first, by line number, the
 * list's first line and the statement that line adds alone (`export { b } from "./m";`): the formatter writes a
 * long list one name a line, so adding a name adds only its line.
 */
export function listedExports(source: string) {
  const lines = source.split("\n").map((l) => uncommented(l).trim());
  const found = new Map<number, { open: number; stmt: string }>();
  for (const [i, l] of lines.entries()) {
    if (!/^export\s*\{[^}]*$/.test(l)) continue;
    const end = lines.findIndex((m, j) => j > i && m.includes("}"));
    const from = lines[end]?.match(/\}\s*from\s*(["'][^"']+["'])/)?.[1];
    for (let j = i + 1; end > i && j <= end; j++)
      found.set(j + 1, {
        open: i + 1,
        stmt: `export { ${lines[j]?.split("}")[0]} }${from ? ` from ${from}` : ""};`,
      });
  }
  return found;
}
