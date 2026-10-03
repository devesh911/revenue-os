// Reading an lcov report, as `bun test --coverage --coverage-reporter=lcov` writes it: which lines of which file ran.

import { relative, resolve } from "node:path";

/** Repo-relative file → line → how many times it ran. A line the report doesn't list holds no code Bun counts. */
export type Hits = Map<string, Map<number, number>>;

/** PURE: an lcov report → each file's listed lines and their hit counts, files named from `root`. */
export function parseLcov(text: string, root: string): Hits {
  const hits: Hits = new Map();
  let lines: Map<number, number> | undefined;
  for (const l of text.split(/\r?\n/)) {
    if (l.startsWith("SF:")) {
      const file = relative(root, resolve(root, l.slice(3)));
      lines = hits.get(file) ?? new Map();
      hits.set(file, lines);
    } else if (l.startsWith("DA:") && lines) {
      const [line = 0, count = Number.NaN] = l.slice(3).split(",").map(Number);
      if (line > 0 && count >= 0)
        lines.set(line, (lines.get(line) ?? 0) + count);
    } else if (l === "end_of_record") lines = undefined;
  }
  return hits;
}

/**
 * PURE: did this line run? Bun 1.3.11 marks the last line of a function as run even when it never ran, so a line
 * counts as run only when the report marks it run and also marks run the nearest earlier line it lists.
 */
export function lineRan(hits: Hits, file: string, line: number): boolean {
  const lines = hits.get(file);
  if (!lines?.get(line)) return false;
  let before = 0;
  for (const l of lines.keys()) if (l < line && l > before) before = l;
  return !before || (lines.get(before) ?? 0) > 0;
}
