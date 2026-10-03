// The change as git reports it: the files a diff touches, the files it deletes, and every line it adds and removes,
// numbered, with the hunk (the run of changed lines) it sits in.

/**
 * A changed line. `hunk` counts git's hunks from 1 across the diff; `moved`: git saw the line move (moved.ts);
 * `within`: for an added line inside a multi-line `export { … }` list, the statement it adds alone (code-text.ts).
 */
export type Added = {
  file: string;
  line: number;
  text: string;
  hunk?: number;
  moved?: boolean;
  within?: string;
};

const ESCAPE: Record<string, number> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  "\\": 92,
};

/**
 * PURE: the path a `diff --git` header names. With renames off both halves name the same path, `a/P b/P`, so a
 * path holding " b/" splits in the middle; a path holding a quote, a backslash or a control character comes
 * quoted, C-style, both halves alike.
 */
function pathOf(rest: string) {
  if (!rest.startsWith('"')) return rest.slice(2, 2 + (rest.length - 5) / 2);
  const bytes: number[] = [];
  for (let i = 1; i < rest.length && rest[i] !== '"'; i++) {
    const c = rest[i] ?? "";
    if (c !== "\\") bytes.push(...new TextEncoder().encode(c));
    else if (/^[0-7]{3}$/.test(rest.slice(i + 1, i + 4))) {
      bytes.push(Number.parseInt(rest.slice(i + 1, i + 4), 8));
      i += 3;
    } else bytes.push(ESCAPE[rest[++i] ?? ""] ?? 0);
  }
  return new TextDecoder().decode(new Uint8Array(bytes)).slice(2);
}

/**
 * PURE: `git diff --unified=0 --no-renames` → the files it touches (each once), the files it deletes (one that became
 * a link is deleted and made again, so it is not among them), and every line it adds and removes.
 */
export function parseDiff(diff: string): {
  files: string[];
  deleted: string[];
  added: Added[];
  removed: Added[];
} {
  const files: string[] = [];
  const gone = new Set<string>();
  const added: Added[] = [];
  const removed: Added[] = [];
  let file = "";
  let line = 0;
  let old = 0;
  let hunks = 0;
  let header = false;
  for (const l of diff.split("\n")) {
    const hunk = l.match(/^@@ -(\d+)\S* \+(\d+)/);
    if (l.startsWith("diff --git ")) {
      file = pathOf(l.slice(11));
      if (!files.includes(file)) files.push(file); // a file that became a link shows twice
      header = true;
    } else if (header && l.startsWith("deleted file mode ")) gone.add(file);
    else if (header && l.startsWith("new file mode ")) gone.delete(file);
    else if (hunk) {
      old = Number(hunk[1]);
      line = Number(hunk[2]);
      hunks++;
      header = false;
    } else if (!header && l.startsWith("+"))
      added.push({ file, line: line++, text: l.slice(1), hunk: hunks });
    else if (!header && l.startsWith("-"))
      removed.push({ file, line: old++, text: l.slice(1), hunk: hunks });
  }
  return { files, deleted: [...gone], added, removed };
}
