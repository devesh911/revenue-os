// Every product line a change adds is run by at least one test: each line it adds to a .ts or .tsx file under apps,
// services or packages (tests aside) must be one the gate's own test run ran, by the lcov report that run wrote and
// the line rule in lcov.ts. A file in scope the report doesn't name counts as 0% covered, unless it holds only
// types. Moved lines are exempt, and so is a line marked as a gap (coverage-marks.ts); a new migration needs its
// database test (migration-tests.ts).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { markOn } from "./coverage-marks";
import type { Added } from "./diff";
import { type Hits, lineRan, parseLcov } from "./lcov";
import { untestedMigrations } from "./migration-tests";
import { isTest } from "./rules";
import { snapshot } from "./snapshot";

/** Was this added line moved from elsewhere in the change, as the done-rules item detects it? */
type Moved = (file: string, line: number) => boolean;
const NOTHING_MOVED: Moved = () => false;

// Declarations (.d.ts) hold nothing that runs; tests are left out by isTest.
const IN_SCOPE = /^(apps|services|packages)\/.+(?<!\.d)\.tsx?$/;

/** PURE: does this code hold anything that runs? Bun's transpiler drops types, comments and type-only imports. */
const runs = (file: string, code: string) => {
  try {
    return (
      new Bun.Transpiler({ loader: file.endsWith(".tsx") ? "tsx" : "ts" })
        .transformSync(code)
        .trim() !== ""
    );
  } catch {
    return true; // code Bun can't read is judged as code
  }
};
// A line with nothing to run on its own: blank, a comment, or brackets and punctuation only.
const BARE = /^\s*(?:(?:\/\/|\/\*|\*).*|[\s{}()[\];,]*)$/;

/** PURE: line numbers → "line 4" or "lines 2-3, 7". */
const span = (ns: number[]) => {
  const parts: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (ns[j + 1] === (ns[j] ?? 0) + 1) j++;
    parts.push(j > i ? `${ns[i]}-${ns[j]}` : `${ns[i]}`);
    i = j;
  }
  return `line${ns.length > 1 ? "s" : ""} ${parts.join(", ")}`;
};

/**
 * PURE: the change's added lines and the test run's report → each added line in scope no test ran, by file, after
 * each mark that does not hold. `read` gives a file as the change leaves it; `exists` says whether a browser test a
 * mark names is in the checkout; `isMoved` says which lines were moved (until the done-rules item lands, none).
 */
export function unrunLines(
  added: Added[],
  hits: Hits,
  io: {
    read: (file: string) => string;
    exists?: (file: string) => boolean;
    isMoved?: Moved;
  },
): string[] {
  const { read, exists = () => false, isMoved = NOTHING_MOVED } = io;
  const code = new Map<string, boolean>(); // per file the report doesn't name: does anything in it run?
  const holdsCode = (f: string) =>
    code.get(f) ?? code.set(f, runs(f, read(f))).get(f);
  const problems: string[] = [];
  const unrun = new Map<string, number[]>();
  for (const a of added) {
    if (!IN_SCOPE.test(a.file) || isTest(a.file) || isMoved(a.file, a.line))
      continue;
    const mark = markOn(a.text);
    const bad =
      mark?.bad ??
      (mark?.test && !(/\.e2e\.tsx?$/.test(mark.test) && exists(mark.test))
        ? `is marked browser-only, but ${mark.test} is not a browser test (a .e2e.ts file) in this checkout`
        : undefined);
    if (bad) problems.push(`${a.file}:${a.line} ${bad}`);
    else if (mark) continue;
    const lines = hits.get(a.file);
    if (
      lines
        ? lines.has(a.line) && !lineRan(hits, a.file, a.line)
        : !BARE.test(a.text) && holdsCode(a.file)
    )
      unrun.set(a.file, [...(unrun.get(a.file) ?? []), a.line]);
  }
  for (const [file, ns] of unrun)
    problems.push(
      `${file}: ${span(ns)} never ran${hits.has(file) ? "" : " (no test loads this file, so all of it counts as not run)"}`,
    );
  return problems;
}

/**
 * The checkout's change since it left origin/main, against the lcov report (at the path `lcov`) of the test run that
 * just ran in it → every added product line no test ran, every mark that does not hold, and every new migration with
 * no database test. Moved lines come from `isMoved`.
 */
export function coverageProblems(
  repo: string,
  lcov: string,
  isMoved: Moved = NOTHING_MOVED,
): string[] {
  const read = (file: string) => {
    try {
      return readFileSync(join(repo, file), "utf8");
    } catch {
      return "";
    }
  };
  const { added } = snapshot(repo);
  // Bun writes no report when no file but tests loaded: then every file in scope counts as not run.
  const report = existsSync(lcov) ? readFileSync(lcov, "utf8") : "";
  return [
    ...unrunLines(added, parseLcov(report, repo), {
      read,
      exists: (file) => existsSync(join(repo, file)),
      isMoved,
    }),
    ...untestedMigrations(added, read),
  ];
}

/** PURE: the problems, as `bun run gate tests` tells them. */
export const gapsTold = (problems: string[]) =>
  `✗ Some lines this change adds are run by no test:\n${problems.map((p) => `- ${p}`).join("\n")}\nWrite a test that runs each one (for a new migration, a database test on the local stack that uses what it adds). A deliberate gap, or a line wrongly reported as not run, is marked on its line: \`// coverage gap: <why>\`; console code only the browser checks reach: \`// coverage: browser-only (<its .e2e.ts file>)\`. Devesh sees every mark, and the PR body quotes each: \`Coverage mark: <file> · <what the mark says>\`.`;
