// A change's tests are proven to test it: each test the change adds or edits must fail on main's code and pass on
// the change. On main, an assertion failing or the test throwing counts; a test file that can't load there counts
// only when what it lacks is a product file or a named export the change adds and, run alone on the change with
// coverage, it runs at least one added line of that file. A test that passes on main is marked on its first line
// with why (already-on-main.ts). Exempt: a change with no product code, and moved lines.

import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { markNote, markOn } from "./already-on-main";
import { exportsOf, statementAt } from "./code-text";
import { lineRan } from "./lcov";
import { mainCopy } from "./main-copy";
import { isProduct, isTest } from "./rules";
import type { Snap } from "./snapshot";
import { type Case, type FileRun, isTestFile, runTestFile } from "./test-run";
import { testEnd } from "./test-span";

/** Is this added line one the change only moved (the done-rules item's moved-code detection)? */
export type IsMoved = (file: string, line: number) => boolean;

type Missing =
  | { export: string; file: string }
  | { module: string; from: string };

/**
 * PURE: what a test file that can't load on main's code lacks, from bun's output: a named export of a file, or a
 * module a file imports. Files are named from `main`, the folder of main's copy.
 */
export function missingOnMain(out: string, main: string): Missing | undefined {
  const exp = out.match(/Export named '([^']+)' not found in module '([^']+)'/);
  if (exp) return { export: exp[1] ?? "", file: relative(main, exp[2] ?? "") };
  const mod = out.match(/Cannot find module '([^']+)' from '([^']+)'/);
  if (mod) return { module: mod[1] ?? "", from: relative(main, mod[2] ?? "") };
}

const at = (c: Case) => `${c.file}:${c.line} "${c.name}"`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const MARK_HOW =
  "make it check what the change adds, or, if it deliberately checks behaviour main already has, put `// behaviour already on main: <why>` at the end of its first line or on the line above it (Devesh sees every mark)";

/**
 * Runs each test file the change adds or edits, alone, on the change (with coverage) and, for those holding a new
 * or edited test, on main's code: the commit the change left main at (`snap.from`). Text for Devesh, and whether
 * every such test is proven. `isMoved` leaves out lines the change only moved.
 */
export function testsProven(
  repo: string,
  snap: Snap,
  isMoved: IsMoved = () => false,
): { ok: boolean; text: string } {
  if (!snap.files.some(isProduct))
    return {
      ok: true,
      text: "Tests proven ✓ no product code changed, so no test has to fail on main's code",
    };
  const added = snap.added.filter((a) => !isMoved(a.file, a.line));
  const addedIn = (file: string) =>
    added.filter((a) => a.file === file).map((a) => a.line);
  const started = Date.now();
  const onChange = snap.files
    .filter(
      (f) => isTestFile(f) && existsSync(join(repo, f)) && addedIn(f).length,
    )
    .map((file) => {
      const run = runTestFile(repo, file, true);
      const text = readFileSync(join(repo, file), "utf8");
      const lines = addedIn(file);
      const tests = run.cases.filter((c) => {
        const end = testEnd(text, c.line);
        return lines.some((l) => l >= c.line && l <= end);
      });
      return { file, run, source: text.split("\n"), tests };
    });
  const changeMs = Date.now() - started;
  const problems: string[] = [];
  for (const { file, run, tests } of onChange) {
    if (!run.finished || !run.cases.length)
      problems.push(
        `${file} can't run on this change: ${firstError(run.out, run.finished)}`,
      );
    for (const c of tests)
      if (c.outcome !== "passed")
        problems.push(
          `${at(c)} ${c.outcome === "failed" ? "fails" : "is skipped"} on this change; it must pass`,
        );
  }
  const judged = onChange.filter((f) => f.tests.length && f.run.cases.length);
  if (!judged.length)
    return problems.length
      ? refused(problems)
      : {
          ok: true,
          text: "Tests proven ✓ no test added or edited outside moved lines, so none has to fail on main's code",
        };
  const copyStarted = Date.now();
  let main: string;
  try {
    main = mainCopy(repo, snap.from, snap.files.filter(isTest));
  } catch (e) {
    return refused([
      ...problems,
      `main's code could not be set up to run the tests on: ${(e as Error).message}`,
    ]);
  }
  const copyMs = Date.now() - copyStarted;
  const marks: string[] = [];
  let proven = 0;
  try {
    const mainStarted = Date.now();
    for (const f of judged) {
      const onMain = runTestFile(main, f.file);
      if (!onMain.finished) {
        problems.push(
          `${f.file} didn't finish on main's code within 10 minutes`,
        );
        continue;
      }
      if (!onMain.cases.length) {
        const why = loadFailure(repo, main, snap, added, f.run, onMain.out);
        if (why)
          problems.push(
            `${f.file} (${f.tests.length} new or edited test(s)) ${why}`,
          );
        else proven += f.tests.length;
        continue;
      }
      for (const c of f.tests) {
        const there = onMain.cases.find(
          (m) => m.line === c.line && m.name === c.name,
        );
        if (there?.outcome === "failed") {
          proven++;
          continue;
        }
        const markAt = [c.line, c.line - 1].find(
          (l) =>
            markOn(f.source[l - 1] ?? "") &&
            (l === c.line || /^\s*\/\//.test(f.source[l - 1] ?? "")),
        );
        if (there?.outcome === "passed" && markAt)
          marks.push(
            markNote(f.file, markAt, markOn(f.source[markAt - 1] ?? "") ?? ""),
          );
        else
          problems.push(
            there?.outcome === "passed"
              ? `${at(c)} passes on main's code too, so it doesn't test this change: ${MARK_HOW}`
              : `${at(c)} ${there ? "is skipped" : "doesn't run"} on main's code, so it can't show that it fails there`,
          );
      }
    }
    const mainMs = Date.now() - mainStarted;
    if (problems.length) return refused(problems);
    const tests = judged.reduce((n, f) => n + f.tests.length, 0);
    return {
      ok: true,
      text:
        `Tests proven ✓ ${proven} of ${tests} new or edited test(s) in ${judged.length} file(s) fail on main's code and pass on this change` +
        (marks.length
          ? `; the other ${marks.length} pass on main too and are marked as behaviour already on main`
          : "") +
        ` (run on this change ${secs(changeMs)}, main's copy built ${secs(copyMs)}, run on main ${secs(mainMs)})` +
        marks.map((m) => `\n⚠ ${m}`).join(""),
    };
  } finally {
    rmSync(main, { recursive: true, force: true });
  }
}

const refused = (problems: string[]) => ({
  ok: false,
  text: `Tests proven ✗ ${problems.length} problem(s) with the change's new and edited tests: each must fail on main's code and pass on this change.\n${problems.map((p) => `- ${p}`).join("\n")}`,
});

/** The first error line bun printed, or that the run was stopped. */
const firstError = (out: string, finished = true) =>
  finished
    ? (out
        .split("\n")
        .find((l) => /^(error:|\w*Error\b)/.test(l.trim()))
        ?.trim() ?? "bun ran no test in it")
    : "it didn't finish within 10 minutes";

/**
 * Why a test file that can't load on main's code proves nothing, or undefined when it counts: what it lacks is a
 * product file or a named export the change adds, and run alone on the change it ran an added line of that file.
 */
function loadFailure(
  repo: string,
  main: string,
  snap: Snap,
  added: Snap["added"],
  onChange: FileRun,
  out: string,
): string | undefined {
  const lacks = missingOnMain(out, main);
  const never = "a missing test helper or fixture never counts";
  if (!lacks)
    return `can't load on main's code (${firstError(out)}); only a missing product file or export this change adds counts`;
  let files: string[];
  let what: string;
  if ("export" in lacks) {
    what = `${lacks.file} lacks the export ${lacks.export}`;
    files = [
      ...new Set(
        added
          .filter(
            (a, i) =>
              isProduct(a.file) &&
              exportsOf(statementAt(added, i).code).includes(lacks.export),
          )
          .map((a) => a.file),
      ),
    ];
    if (!isProduct(lacks.file) || !files.length)
      return `can't load on main's code because ${what}, which is not a product export this change adds; ${never}`;
  } else {
    let file: string;
    try {
      const from = join(repo, dirname(lacks.from));
      file = relative(
        realpathSync(repo),
        realpathSync(Bun.resolveSync(lacks.module, from)),
      );
    } catch {
      return `can't load on main's code: it imports ${lacks.module}, which this change doesn't hold either`;
    }
    what = `${file} is missing`;
    files = [file];
    if (!isProduct(file) || !snap.files.includes(file))
      return `can't load on main's code because ${what}, which is not product code this change adds; ${never}`;
  }
  const ran = files.some((f) =>
    added.some((a) => a.file === f && lineRan(onChange.hits, f, a.line)),
  );
  return ran
    ? undefined
    : `can't load on main's code because ${what}, but run alone on this change it runs none of the lines this change adds to ${files.join(", ")}`;
}
