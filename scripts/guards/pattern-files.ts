// The pattern-files guard: every file a pattern in docs/patterns names exists, and every excerpt's lines are still
// in the file it names, in the same order, so the examples agents copy can't point at invented code or drift from
// the real code.
//
// A name is a repository path, from the repository's root: a word in backticks with a "/" in it (`docs/patterns/`),
// or, in prose and in a code comment, a word with a "/" ending in a file extension (packages/db/src/client.ts),
// either one with `:12` or `:12-20` after it allowed. A package (@revenue-os/db), a web address, a word pair
// (and/or) and code outside a comment name no file. An excerpt is a code block whose first line is a comment holding
// only a file's path (`// apps/console/src/features/guardrails/api.ts`); its other lines are copied from that file
// word for word, a line of just "…" (comment marks allowed) standing for lines left out, and a "…" inside a line for
// words left out.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "docs/patterns";
const PATH = /^[\w.-]+(?:\/[\w.-]*)+$/;
const FILE = /^[\w.-]+(?:\/[\w.-]+)*\.[A-Za-z]\w*$/;
const LINE_NUMBER = /:\d+(?:-\d+)?$/;
const WEB_ADDRESS = /\S*:\/\/\S*/g;
const LABEL = /^\s*(?:\/\/|#|--|\{?\/\*)\s*(\S+?)\s*(?:\*\/\}?)?\s*$/;
const ELIDED = /^\s*(?:\/\/|#|--|\{?\/\*)?\s*…\s*(?:\*\/\}?)?\s*$/;
const COMMENT = /(?:\/\/|\/\*|^\s*(?:#|--|\*))(.*)$/;
const literally = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The files a stretch of prose or comment names: its words with a "/" that end in a file extension. */
const filesIn = (text: string) =>
  text
    .replace(WEB_ADDRESS, "")
    .split(/[\s,;()'"`]+/)
    .map((w) => w.replace(/[.:]+$/, "").replace(LINE_NUMBER, ""))
    .filter((w) => w.includes("/") && FILE.test(w));

/** The excerpt's first line its file doesn't have after the lines matched before it, if any. */
function missingLine(excerpt: string[], file: string[]) {
  let at = 0;
  for (const line of excerpt) {
    if (!line.trim() || ELIDED.test(line)) continue;
    const same = new RegExp(
      `^${line.trimEnd().split("…").map(literally).join(".*")}$`,
    );
    const found = file.findIndex((l, i) => i >= at && same.test(l.trimEnd()));
    if (found < 0) return line.trim();
    at = found + 1;
  }
}

/** One pattern file's problems: each name that doesn't exist, and each excerpt that no longer matches its file. */
function problemsIn(pattern: string): string[] {
  const names = new Set<string>();
  const excerpts: { name: string; lines: string[] }[] = [];
  let block: string[] | undefined; // the code block being read, if any
  for (const raw of readFileSync(pattern, "utf8").split("\n")) {
    const line = raw.replace(WEB_ADDRESS, "");
    if (/^\s*```/.test(line)) {
      const label = block?.[0]?.match(LABEL)?.[1] ?? "";
      if (block && FILE.test(label)) {
        names.add(label);
        excerpts.push({ name: label, lines: block.slice(1) });
      }
      block = block ? undefined : [];
    } else if (block) {
      block.push(raw);
      for (const f of filesIn(line.match(COMMENT)?.[1] ?? "")) names.add(f);
    } else {
      for (const [, quoted = ""] of line.matchAll(/`([^`]+)`/g)) {
        const name = quoted.replace(LINE_NUMBER, "");
        if (PATH.test(name)) names.add(name);
      }
      for (const f of filesIn(line.replace(/`[^`]*`/g, " "))) names.add(f);
    }
  }
  const problems = [...names]
    .filter((name) => !existsSync(name))
    .map((name) => `${pattern} names ${name}, which does not exist`);
  for (const { name, lines } of excerpts) {
    if (!existsSync(name)) continue;
    const gone = missingLine(lines, readFileSync(name, "utf8").split("\n"));
    if (gone !== undefined)
      problems.push(
        `${pattern}: the excerpt of ${name} has a line that file doesn't, in this order: ${gone}`,
      );
  }
  return problems;
}

if (!existsSync(DIR)) {
  console.log(`guard patterns · skipped (no ${DIR})`);
  process.exit(0);
}
console.log(
  "guard patterns · docs/patterns names only files that exist, and its excerpts match them",
);
const problems = readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .flatMap((f) => problemsIn(join(DIR, f)));
for (const p of problems) console.log(`  ${p}`);
if (problems.length) {
  console.log(
    "  FAIL — patterns: fix each name above, or copy the excerpt again from its file (a line of … for lines left out)",
  );
  process.exit(1);
}
console.log("  PASS");
