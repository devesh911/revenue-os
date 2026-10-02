// The pattern-files guard: the examples agents copy (docs/patterns, AGENTS.md → Docs) can't be invented code, drift
// from the real code, or point at files that don't exist. Every code block in a pattern file is an excerpt of a file
// the repository holds, and every file or folder a pattern names in prose is one the repository holds.
//
// The repository's files are the ones `git ls-files` lists (committed, or new and not ignored), each a plain file or
// link on disk. A name is looked up in that list, never on disk, so a path outside the repository, an ignored file
// (a build's output, a secrets file) and another letter case all count as missing, the same here as in CI; and an
// excerpt is compared only with a listed plain file, never a link, so a pattern can't make this guard read anything
// else.
//
// An excerpt is a code block (``` or ~~~) whose first line is a comment holding only a file's path from the
// repository's root (`// apps/console/src/features/guardrails/api.ts`). Its other lines are copied from that file
// word for word: each line right after the one before it, as in the file, a line of just "…" (comment marks
// allowed) standing for lines left out and a "…" inside a line for words left out. Names inside an excerpt are the
// real file's own (fix-when-touched entry 1 deals with stale ones), so they are not looked up here. A code block
// indented four spaces is never an excerpt.
//
// A name in prose is a word in backticks that reads as a path (it ends in "/", ends in a file extension, or starts
// with one of the repository's top-level files or folders: `packages/db`), a word with a "/" ending in a file
// extension (packages/db/src/client.ts), or a link's target, read from the pattern file's own folder; a `:12` or
// `:12-20` after it is allowed. A package (`hono/cors`), a branch (`origin/main`), a word pair (and/or) and a web
// address name no file.

import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { posix } from "node:path";

const DIR = "docs/patterns/";
const PATH = /^[\w.-]+(?:\/[\w.-]*)+$/;
const FILE = /^[\w.-]+(?:\/[\w.-]+)*\.[A-Za-z]\w*$/;
const LABEL_PATH = /^(?=.*[./])[\w.-]+(?:\/[\w.-]+)*$/;
const LINE_NUMBER = /:\d+(?:-\d+)?$/;
const WEB_ADDRESS = /\S*:\/\/\S*/g;
const LINK = /\]\(([^()\s]+)\)/g;
const SCHEME = /^[a-z][\w+.-]*:/i;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const INDENTED = /^(?: {4}|\t)\s*\S/;
const LABEL = /^\s*(?:\/\/|#|--|\{?\/\*|<!--)\s*(\S+?)\s*(?:\*\/\}?|-->)?\s*$/;
const ELIDED = /^\s*(?:\/\/|#|--|\{?\/\*|<!--)?\s*…\s*(?:\*\/\}?|-->)?\s*$/;
const literally = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function fail(lines: string[]): never {
  for (const l of lines) console.log(`  ${l}`);
  console.log(
    "  FAIL — patterns: make each code block an excerpt (its first line the path of the file it copies, then that file's lines; a line of … for lines left out), and name only files and folders the repository holds",
  );
  process.exit(1);
}

console.log(
  "guard patterns · every docs/patterns example is an excerpt of a file the repository holds, and every name a pattern gives is one",
);
const git = (...args: string[]) =>
  spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 << 20 });
const root = git("rev-parse", "--show-toplevel");
if (root.status !== 0)
  fail(["git can't read this checkout: nothing was checked"]);
process.chdir(root.stdout.trim());
const listed = git(
  "ls-files",
  "-z",
  "--cached",
  "--others",
  "--exclude-standard",
);
if (listed.status !== 0) fail(["git ls-files failed: nothing was checked"]);
const files = new Set(
  listed.stdout
    .split("\0")
    .filter((f) => f && lstatSync(f, { throwIfNoEntry: false })),
);
const folders = new Set(
  [...files].flatMap((f) =>
    f
      .split("/")
      .slice(0, -1)
      .map((_, i, parts) => `${parts.slice(0, i + 1).join("/")}/`),
  ),
);
const topLevel = new Set([...files].map((f) => f.split("/")[0]));
const held = (name: string) =>
  files.has(name) || folders.has(name.replace(/\/?$/, "/"));

/** The files a stretch of prose names: its words with a "/" that end in a file extension. */
const filesIn = (text: string) =>
  text
    .split(/[\s,;()'"`]+/)
    .map((w) => w.replace(/[.:]+$/, "").replace(LINE_NUMBER, ""))
    .filter((w) => w.includes("/") && FILE.test(w));

/** The names one line of prose gives: link targets (from the pattern's folder), backticked paths, bare file paths. */
function namesIn(raw: string, pattern: string): string[] {
  const names: string[] = [];
  const line = raw
    .replace(WEB_ADDRESS, " ")
    .replace(LINK, (_, target: string) => {
      const path = target.split("#")[0];
      if (path && !SCHEME.test(path))
        names.push(posix.normalize(posix.join(posix.dirname(pattern), path)));
      return "]";
    });
  for (const [, quoted = ""] of line.matchAll(/`([^`]+)`/g)) {
    const name = quoted.replace(LINE_NUMBER, "");
    if (
      PATH.test(name) &&
      (name.endsWith("/") ||
        FILE.test(name) ||
        topLevel.has(name.split("/")[0]))
    )
      names.push(name);
  }
  return [...names, ...filesIn(line.replace(/`[^`]*`/g, " "))];
}

/**
 * The excerpt's first line its file doesn't hold where it should, if any: each stretch of lines between "…" lines
 * must be lines that follow one another in the file, each stretch after the one before.
 */
function driftedLine(excerpt: string[], file: string[]) {
  const stretches: string[][] = [[]];
  for (const line of excerpt)
    if (ELIDED.test(line)) stretches.push([]);
    else stretches[stretches.length - 1]?.push(line);
  let at = 0;
  for (const stretch of stretches.filter((s) => s.length)) {
    const same = stretch.map(
      (l) =>
        new RegExp(`^${l.trimEnd().split("…").map(literally).join(".*")}$`),
    );
    /** Where the stretch's first n lines start in the file, from `at` on; -1 when nowhere. */
    const start = (n: number) =>
      file.findIndex(
        (_, i) =>
          i >= at &&
          i + n <= file.length &&
          same
            .slice(0, n)
            .every((m, j) => m.test((file[i + j] ?? "").trimEnd())),
      );
    const found = start(stretch.length);
    if (found < 0) {
      let n = stretch.length - 1;
      while (n > 0 && start(n) < 0) n--;
      return stretch[n]?.trim() || "(a blank line)";
    }
    at = found + stretch.length;
  }
}

/** One code block's problems: it is not an excerpt, names a file the repository doesn't hold, or has drifted. */
function blockProblems(pattern: string, at: number, block: string[]): string[] {
  const label = block[0]?.match(LABEL)?.[1] ?? "";
  if (!LABEL_PATH.test(label))
    return [
      `${pattern}:${at}: a code block that is not an excerpt: its first line must be a comment holding only the path of the file it copies (// path/to/file.ts), or delete it`,
    ];
  if (!files.has(label))
    return [`${pattern} names ${label}, which the repository does not hold`];
  if (!lstatSync(label).isFile())
    return [
      `${pattern}: the excerpt of ${label} is a link, which this guard never reads; copy from the file it points to`,
    ];
  const drifted = driftedLine(
    block.slice(1),
    readFileSync(label, "utf8").split("\n"),
  );
  return drifted === undefined
    ? []
    : [
        `${pattern}: the excerpt of ${label} no longer matches it from this line: ${drifted}`,
      ];
}

/** One pattern file's problems: each code block's, then each name in its prose the repository doesn't hold. */
function problemsIn(pattern: string): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  const lines = readFileSync(pattern, "utf8").split("\n");
  let fence = ""; // the open code block's fence, if any
  let block: string[] = [];
  let opened = 0;
  lines.forEach((line, i) => {
    const mark = line.match(FENCE)?.[1] ?? "";
    if (fence) {
      if (
        mark[0] === fence[0] &&
        mark.length >= fence.length &&
        line.trim() === mark
      ) {
        problems.push(...blockProblems(pattern, opened, block));
        fence = "";
      } else block.push(line);
    } else if (mark) {
      [fence, block, opened] = [mark, [], i + 1];
    } else if (INDENTED.test(line) && !lines[i - 1]?.trim()) {
      problems.push(
        `${pattern}:${i + 1}: an indented code block; an example is a fenced excerpt of a real file`,
      );
    } else for (const name of namesIn(line, pattern)) names.add(name);
  });
  if (fence) problems.push(...blockProblems(pattern, opened, block));
  for (const name of names)
    if (!held(name))
      problems.push(
        `${pattern} names ${name}, which the repository does not hold`,
      );
  return problems;
}

const patterns = [...files]
  .filter((f) => f.startsWith(DIR) && f.endsWith(".md"))
  .sort();
if (!patterns.length)
  fail([
    `no pattern files under ${DIR}: AGENTS.md → Docs sends agents there, so a moved folder moves this guard too`,
  ]);
const problems = patterns.flatMap((p) =>
  lstatSync(p).isFile()
    ? problemsIn(p)
    : [`${p} is a link, which this guard never reads`],
);
if (problems.length) fail(problems);
console.log(
  `  PASS (${patterns.length} pattern file${patterns.length === 1 ? "" : "s"})`,
);
