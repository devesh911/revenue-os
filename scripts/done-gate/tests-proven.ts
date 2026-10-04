// A change's tests are proven to test it: each test the change adds or edits (test-edits.ts) must fail on main's
// code and pass on the change. Both runs happen in scratch copies built alike (code-copy.ts); main's holds every
// file of the change but its product code (its test helpers and fixtures come along, test-only.ts), so product code
// is all that differs. On main an assertion failing or the test throwing counts. In a test file that can't load
// there, a test counts only when what the file lacks is a product file or a named export the change adds, and the
// test, run alone on the change with coverage, runs an added line of that file beyond what loading the file runs.
// A test that passes on main must carry the mark (already-on-main.ts). Exempt: a change with no product code,
// moved lines (test-edits.ts), and a test MAY_SKIP lets skip (tests-ran.ts), when it skips.

import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { markNote, marksIn } from "./already-on-main";
import { codeCopy } from "./code-copy";
import { exportsOf, statementAt } from "./code-text";
import type { Added } from "./diff";
import { type Hits, lineRan } from "./lcov";
import { isProduct } from "./rules";
import type { Snap } from "./snapshot";
import { edits, movedLine } from "./test-edits";
import { testOnly } from "./test-only";
import {
  type Case,
  isTestFile,
  NO_TEST,
  onlyTest,
  runTestFile,
} from "./test-run";
import { MAY_SKIP } from "./tests-ran";

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
  "make it check what the change adds, or, if it deliberately checks behaviour main already has, put `// behaviour already on main: <why>` at the end of its first line or alone on the comment line just above it (Devesh sees every mark)";

/**
 * Runs each test file the change adds or edits, alone, in a copy of the change (with coverage) and, for those
 * holding a new or edited test that passes there, in a copy of main's code. Text for Devesh, and whether every
 * such test is proven. Lines the change only moved, as the snapshot marks them (test-edits.ts), are left out.
 */
export function testsProven(
  repo: string,
  snap: Snap,
): { ok: boolean; text: string } {
  if (!snap.files.some(isProduct))
    return {
      ok: true,
      text: "Tests proven ✓ no product code changed, so no test has to fail on main's code",
    };
  const touched = snap.files
    .filter((f) => isTestFile(f) && existsSync(join(repo, f)))
    .map((file) => {
      const text = readFileSync(join(repo, file), "utf8");
      return { file, text, ...edits(snap, file, text) };
    })
    .filter((f) => f.any);
  const moved = snap.added.some(movedLine);
  const none = `Tests proven ✓ no test added or edited${moved ? " outside moved lines" : ""}, so none has to fail on main's code`;
  if (!touched.length) return { ok: true, text: none };
  const helpers = testOnly(snap);
  const product = snap.files.filter((f) => isProduct(f) && !helpers.has(f));
  const added = snap.added.filter((a) => !movedLine(a));
  const copies: string[] = [];
  const copy = (files: string[]) => {
    const dir = codeCopy(repo, snap.from, files);
    copies.push(dir);
    return dir;
  };
  const problems: string[] = [];
  const marked: string[] = [];
  const unjudged: string[] = [];
  /** Is this test, skipped `where`, one MAY_SKIP lets skip? Then it is noted and not judged. */
  const maySkip = (c: Case, where: string) => {
    const why = MAY_SKIP[`${c.file} > ${c.name}`];
    if (why)
      unjudged.push(
        `not judged: ${at(c)} is skipped ${where}, which MAY_SKIP allows (${why})`,
      );
    return why !== undefined;
  };
  let proven = 0;
  let loadOnly = 0;
  let judged = 0;
  const files = new Set<string>();
  const started = Date.now();
  try {
    let change: string;
    let main: string | undefined;
    try {
      change = copy(snap.files);
    } catch (e) {
      return refused([
        `the change could not be copied to run its tests on: ${(e as Error).message}`,
      ]);
    }
    for (const f of touched) {
      const run = runTestFile(change, f.file, { coverage: true });
      if (!run.finished || !run.cases.length) {
        problems.push(
          `${f.file} can't run on this change: ${firstError(run.out, run.finished)}`,
        );
        continue;
      }
      const tests = run.cases.filter((c) => {
        if (!f.touches(c.line)) return false;
        if (c.outcome === "passed") return true;
        if (c.outcome === "failed" || !maySkip(c, "on this change"))
          problems.push(
            `${at(c)} ${c.outcome === "failed" ? "fails" : "is skipped"} on this change (in a scratch copy of it, which holds nothing git ignores); it must pass`,
          );
        return false;
      });
      if (!tests.length) continue;
      try {
        main ??= copy(snap.files.filter((g) => !product.includes(g)));
      } catch (e) {
        return refused([
          ...problems,
          `main's code could not be copied to run the tests on: ${(e as Error).message}`,
        ]);
      }
      files.add(f.file);
      judged += tests.length;
      const onMain = runTestFile(main, f.file);
      if (!onMain.finished) {
        problems.push(
          `${f.file} didn't finish on main's code: it ran past 10 minutes or was stopped`,
        );
        continue;
      }
      if (!onMain.cases.length && onMain.status !== 0) {
        const lacks = lacking(change, main, added, product, onMain.out);
        if (typeof lacks === "string") {
          for (const c of tests) problems.push(`${at(c)} ${lacks}`);
          continue;
        }
        const loaded = runTestFile(change, f.file, {
          coverage: true,
          only: NO_TEST,
        }).hits;
        for (const c of tests) {
          const alone = runTestFile(change, f.file, {
            coverage: true,
            only: onlyTest(c.name),
          }).hits;
          const count = (h: Hits, a: Added) => h.get(a.file)?.get(a.line) ?? 0;
          if (
            added.some(
              (a) =>
                lacks.files.includes(a.file) &&
                lineRan(alone, a.file, a.line) &&
                count(alone, a) > count(loaded, a),
            )
          ) {
            proven++;
            loadOnly++;
          } else
            problems.push(
              `${at(c)} can't load on main's code because ${lacks.what}, and run alone on this change it runs none of the lines this change adds to ${lacks.files.join(", ")} beyond what loading them runs`,
            );
        }
        continue;
      }
      const marks = marksIn(f.file, f.text, f.touches);
      for (const c of tests) {
        const there = onMain.cases.find(
          (m) => m.line === c.line && m.name === c.name,
        );
        const mark = marks.find((m) => m.start === c.line);
        if (there?.outcome === "failed") proven++;
        else if (there?.outcome === "skipped" && maySkip(c, "on main's code"))
          judged--;
        else if (there?.outcome === "passed" && mark)
          marked.push(markNote(mark));
        else
          problems.push(
            there?.outcome === "passed"
              ? `${at(c)} passes on main's code too, so it doesn't test this change: ${MARK_HOW}`
              : `${at(c)} ${there ? "is skipped" : "doesn't run"} on main's code, so it can't show that it fails there`,
          );
      }
    }
  } finally {
    for (const d of copies) rmSync(d, { recursive: true, force: true });
  }
  const notes = [...marked, ...unjudged].map((n) => `\n⚠ ${n}`).join("");
  if (problems.length) return refused(problems, notes);
  const took = ` (scratch copies built and tests run in ${secs(Date.now() - started)})`;
  return {
    ok: true,
    text:
      (judged
        ? `Tests proven ✓ ${proven} passed on this change and failed on main's code, of ${judged} new or edited test(s) in ${files.size} file(s)` +
          (loadOnly
            ? ` (${loadOnly} of them because their file can't load there without what this change adds, each running an added line of it)`
            : "") +
          (marked.length
            ? `; ${marked.length} of them pass(es) there too and carry the mark "behaviour already on main"`
            : "")
        : unjudged.length
          ? "Tests proven ✓ no new or edited test judged: each one skipped, as MAY_SKIP allows"
          : none) +
      took +
      notes,
  };
}

const refused = (problems: string[], notes = "") => ({
  ok: false,
  text: `Tests proven ✗ ${problems.length} problem(s) with the change's new and edited tests: each must fail on main's code and pass on this change.\n${problems.map((p) => `- ${p}`).join("\n")}${notes}`,
});

/** The first error line bun printed, or that the run was stopped. */
const firstError = (out: string, finished = true) =>
  finished
    ? (out
        .split("\n")
        .find((l) => /^(error:|\w*Error\b)/.test(l.trim()))
        ?.trim() ?? "bun ran no test in it")
    : "it ran past 10 minutes or was stopped";

/**
 * For a test file that can't load on main's code: what it lacks and the product files whose added lines its tests
 * must run, or why none of its tests counts. A missing file or export can only be product code the change adds,
 * since main's copy holds everything else of the change.
 */
function lacking(
  change: string,
  main: string,
  added: Added[],
  product: string[],
  out: string,
): { what: string; files: string[] } | string {
  const lacks = missingOnMain(out, main);
  if (!lacks)
    return `can't load on main's code (${firstError(out)}); only a missing product file or export this change adds counts`;
  if ("module" in lacks)
    try {
      const file = relative(
        change,
        realpathSync(
          Bun.resolveSync(lacks.module, join(change, dirname(lacks.from))),
        ),
      );
      return { what: `${file} is missing`, files: [file] };
    } catch {
      return `can't load on main's code: it imports ${lacks.module}, which this change doesn't hold either`;
    }
  const what = `${lacks.file} lacks the export ${lacks.export}`;
  const files = [
    ...new Set(
      added
        .filter(
          (a, i) =>
            product.includes(a.file) &&
            exportsOf(statementAt(added, i).code).includes(lacks.export),
        )
        .map((a) => a.file),
    ),
  ];
  return files.length
    ? { what, files }
    : `can't load on main's code because ${what}, which is not an export this change adds to product code`;
}
