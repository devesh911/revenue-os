// Reading an lcov coverage report (`bun test --coverage --coverage-reporter=lcov`): which lines of which files ran.

import { isAbsolute, relative } from "node:path";

/** Repo-relative file → line → how many times it ran. */
export type Hits = Map<string, Map<number, number>>;

/** PURE: an lcov report → each file's line counts, named from `root` (bun names files from where it ran). */
export function parseLcov(text: string, root: string): Hits {
  const hits: Hits = new Map();
  let lines: Map<number, number> | undefined;
  for (const l of text.split("\n")) {
    if (l.startsWith("SF:")) {
      const f = l.slice(3).trim();
      const file = isAbsolute(f) ? relative(root, f) : f;
      lines = hits.get(file) ?? new Map();
      hits.set(file, lines);
    } else if (l.startsWith("DA:") && lines) {
      const [line = Number.NaN, count = Number.NaN] = l
        .slice(3)
        .split(",")
        .map(Number);
      if (Number.isInteger(line) && Number.isFinite(count))
        lines.set(line, (lines.get(line) ?? 0) + count);
    } else if (l.startsWith("end_of_record")) lines = undefined;
  }
  return hits;
}

/**
 * PURE: did `line` of `file` run? Bun 1.3.11 marks a function's last line as run even when the function never ran,
 * so a line counts only when Bun marks it run and also marks run the nearest earlier line the report lists. A file
 * missing from the report ran nothing.
 */
export function lineRan(hits: Hits, file: string, line: number): boolean {
  const lines = hits.get(file);
  if (!lines?.get(line)) return false;
  let earlier = 0;
  for (const l of lines.keys()) if (l < line && l > earlier) earlier = l;
  return !earlier || (lines.get(earlier) ?? 0) > 0;
}
