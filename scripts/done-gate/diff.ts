// The change as git reports it: the files a diff touches, and every line it adds and removes, numbered.

export type Added = { file: string; line: number; text: string };

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

/** PURE: `git diff --unified=0 --no-renames` → the files it touches (each once), and every line it adds and removes. */
export function parseDiff(diff: string): {
  files: string[];
  added: Added[];
  removed: Added[];
} {
  const files: string[] = [];
  const added: Added[] = [];
  const removed: Added[] = [];
  let file = "";
  let line = 0;
  let old = 0;
  let header = false;
  for (const l of diff.split("\n")) {
    const hunk = l.match(/^@@ -(\d+)\S* \+(\d+)/);
    if (l.startsWith("diff --git ")) {
      file = pathOf(l.slice(11));
      if (!files.includes(file)) files.push(file); // a file that became a link shows twice
      header = true;
    } else if (hunk) {
      old = Number(hunk[1]);
      line = Number(hunk[2]);
      header = false;
    } else if (!header && l.startsWith("+"))
      added.push({ file, line: line++, text: l.slice(1) });
    else if (!header && l.startsWith("-"))
      removed.push({ file, line: old++, text: l.slice(1) });
  }
  return { files, added, removed };
}
