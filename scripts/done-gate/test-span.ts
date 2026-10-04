// Where a test ends: from the line bun reports a test starting on, the line where the brackets it opens close.

// Words after which a "/" starts a regular expression rather than dividing.
const BEFORE_REGEX = new Set(
  "return typeof case do else in of new delete void throw instanceof yield await".split(
    " ",
  ),
);
const WORD = /[\w$]+/y;

/**
 * PURE: the last line of the test whose call starts on `start` (1-based): the first line, from that one on, that
 * ends with every bracket opened since its start closed again. Brackets inside strings, template text, comments
 * and regular expressions don't count; a quote right after a letter is an apostrophe in JSX text (Don't). A bracket
 * left open in JSX text, "(" alone, is read as code: the test then seems to run on to the file's end.
 */
export function testEnd(source: string, start: number): number {
  const s = source;
  let i = 0;
  for (let row = 1; row < start; row++) {
    const n = s.indexOf("\n", i);
    if (n < 0) return start;
    i = n + 1;
  }
  let depth = 0;
  const holes: number[] = []; // for each open `${` of a template, the depth its `}` closes back to
  let prev = ""; // the last word, or the last character of anything else
  const rowAt = (at: number) => s.slice(0, at).split("\n").length;
  // From just after a "`" or the "}" of a `${…}`, past the template's text to its end or its next `${`.
  const template = () => {
    for (; i < s.length; i++) {
      if (s[i] === "\\") i++;
      else if (s[i] === "`") return;
      else if (s[i] === "$" && s[i + 1] === "{") {
        holes.push(depth++);
        i++;
        return;
      }
    }
  };
  for (; i < s.length; i++) {
    const c = s[i] ?? "";
    if (c === "\n" && depth <= 0) return rowAt(i);
    if (/\s/.test(c)) continue;
    if (c === "/" && s[i + 1] === "/") {
      const n = s.indexOf("\n", i);
      i = (n < 0 ? s.length : n) - 1;
    } else if (c === "/" && s[i + 1] === "*") {
      const n = s.indexOf("*/", i + 2);
      i = n < 0 ? s.length : n + 1;
    } else if ((c === '"' || c === "'") && !/[A-Za-z]/.test(s[i - 1] ?? "")) {
      for (i++; i < s.length && s[i] !== c && s[i] !== "\n"; i++)
        if (s[i] === "\\") i++;
      prev = ")"; // a value: a "/" after it divides
    } else if (c === "`") {
      i++;
      template();
      prev = ")";
    } else if (
      c === "/" &&
      (BEFORE_REGEX.has(prev) || !/[\w$)\]}<]/.test(prev.at(-1) ?? "")) // after "<": a JSX closing tag
    ) {
      let inClass = false;
      for (i++; i < s.length && s[i] !== "\n"; i++) {
        if (s[i] === "\\") i++;
        else if (s[i] === "[") inClass = true;
        else if (s[i] === "]") inClass = false;
        else if (s[i] === "/" && !inClass) break;
      }
      prev = ")";
    } else if (c === "}" && holes.at(-1) === depth - 1) {
      holes.pop();
      depth--;
      i++;
      template();
      prev = ")";
    } else {
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      WORD.lastIndex = i;
      const word = WORD.exec(s)?.[0];
      prev = word ?? c;
      if (word) i += word.length - 1;
    }
  }
  return rowAt(s.length);
}
