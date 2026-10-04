// A removed test is a decision Devesh sees: a change that deletes a test file, a test (`it(` or `test(`) or an
// `expect` line names each one in a line it adds to docs/removed-tests.md, which the stop, CI's log and the PR body
// (pr-quotes.ts) all show. Three things are no removal: a test moved whole into a file a test runner runs (its first
// line and each expect line after it landing together, as git's moved-code detection sees them, moved.ts), an expect
// git sees move within its run of changed lines and its own test (re-indented, its body wrapped in a block), and an
// expect rewritten where it stood, in that run, into one that checks more than a constant. A test renamed as its
// expect lines go is removed under its old name; an expect moved out of its test, without it, is removed.

import { uncommented } from "./code-text";
import type { Added } from "./diff";

export const REMOVED_TESTS = "docs/removed-tests.md";
const ENTRY = /^(?:-\s+)?(\d{4}-\d{2}-\d{2} · .*)$/;
// Files a test runner runs: bun's *.test.*, *_test.*, *.spec.* and *_spec.*, and Playwright's *.e2e.ts
// (apps/console/playwright.config.ts). A helper in a test folder runs no test of its own.
const RUNS = /[._](test|spec)\.[cm]?[jt]sx?$|\.e2e\.ts$/;

/** PURE: the entries a change adds to docs/removed-tests.md (`YYYY-MM-DD · <file> > <what> · <why>`), without a leading "- ". */
export const entriesOf = (added: Added[]) =>
  added.flatMap((a) =>
    a.file === REMOVED_TESTS
      ? (a.text.trim().match(ENTRY)?.slice(1) ?? [])
      : [],
  );

/** A line as code: block-comment lines, comments and every string's content gone (a test's name included). */
const code = (text: string) =>
  uncommented(text.replace(/^\s*(?=\*).*?(?:\*\/|$)/, ""), true).replace(
    /`(?:\\[\s\S]|[^\\`])*`/g,
    "``",
  );
const CALL = /(?<![\w$.])(?:it|test)(?:\s*\.\s*[\w$]+)*\s*\(\s*(?:""|``|$)/;
const NAMED =
  /(?<![\w$.])(?:it|test)(?:\s*\.\s*[\w$]+)*\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/;
const EXPECT = /(?<![\w$.])expect\s*(?:\.\s*[\w$]+\s*)?\(/;
// An expect of a constant (`expect(true)`, `expect(1)`, `expect("x")`), which checks nothing.
const CONSTANT =
  /(?<![\w$.])expect\s*\(\s*(?:true|false|null|undefined|NaN|-?[\d.][\w.]*|"(?:\\.|[^\\"])*"|'(?:\\.|[^\\'])*'|`[^`$]*`|\[\s*\]|\{\s*\})\s*\)/;

/** PURE: the name of the test a line starts, reading the next line when the formatter put the name there. */
function testName(line: Added, next?: Added) {
  if (!CALL.test(code(line.text))) return;
  const own = uncommented(line.text).match(NAMED)?.[2];
  if (own !== undefined) return own;
  if (next?.file === line.file && next.line === line.line + 1)
    return next.text.match(/^\s*(["'`])((?:\\.|(?!\1).)*)\1/)?.[2];
}

/** PURE: `gone` without those paired, by `key`, with one of `come` each; and what of `come` is left. */
function pair<T>(gone: T[], come: T[], key: (t: T) => string) {
  const left = [...come];
  const lost = gone.filter((g) => {
    const i = left.findIndex((c) => key(c) === key(g));
    if (i >= 0) left.splice(i, 1);
    return i < 0;
  });
  return { lost, left };
}

/**
 * PURE: the change's removed and added lines (`isTest` says which files hold tests), the files it deletes and the
 * entries it adds to docs/removed-tests.md → a problem for each test file, test or expect line it removes that no
 * entry names. A test file deleted with nothing moved out of it into a file a test runner runs is named once, whole;
 * an expect line after a removed test's start is covered by the test's entry.
 */
export function removalProblems(
  added: Added[],
  removed: Added[],
  deleted: string[],
  entries: string[],
  isTest: (file: string) => boolean,
) {
  const named = (target: string, file: string) =>
    entries.some((e) =>
      [
        target,
        ...(deleted.includes(file) ? [`${file} > whole file`] : []),
      ].some((t) => {
        const why = e.slice(13).startsWith(`${t} · `)
          ? e.slice(13 + t.length + 3)
          : "";
        return /[\p{L}\p{N}]/u.test(why);
      }),
    );
  const problems: string[] = [];
  const say = (file: string, what: string, how: string) => {
    const target = `${file} > ${what}`;
    if (!named(target, file))
      problems.push(
        `${target}: ${how}; to remove it on purpose, add a line to ${REMOVED_TESTS} in this change: \`YYYY-MM-DD · ${target} · <why>\``,
      );
  };
  const text = (l: Added) => l.text.trim();
  const starts = (lines: Added[]) =>
    lines.filter((l, i) => testName(l, lines[i + 1]) !== undefined);
  // Where moved lines landed in files a test runner runs, each taken by one removed line of the same text.
  const landings = added.filter((a) => a.moved && RUNS.test(a.file));
  const newStarts = starts(added);
  const taken = new Set<Added>();
  const land = (r: Added, ok: (a: Added) => boolean = () => true) => {
    const a = r.moved
      ? landings.find((l) => !taken.has(l) && text(l) === text(r) && ok(l))
      : undefined;
    if (a) taken.add(a);
    return a;
  };
  /** Lands after `home`, a test's first line, in its run of added lines, with no other test starting in between. */
  const after = (home: Added) => (a: Added) =>
    a.file === home.file &&
    a.hunk === home.hunk &&
    a.line > home.line &&
    !newStarts.some(
      (s) => s.file === a.file && s.line > home.line && s.line < a.line,
    );
  const tests = (lines: Added[]) =>
    lines.flatMap((l, i) => {
      const name = testName(l, lines[i + 1]);
      return name === undefined ? [] : [{ name, line: l.line }];
    });
  const expects = (lines: Added[]) =>
    lines.filter((l) => EXPECT.test(code(l.text)));
  /** The test `l` sits in, by the last test its run of `lines` starts before it ("": the one starting above the run). */
  const owner = (lines: Added[], l: Added) =>
    tests(
      lines.filter(
        (o) => o.file === l.file && o.hunk === l.hunk && o.line < l.line,
      ),
    ).at(-1)?.name ?? "";
  /** Lands in the run of lines `r` left, in the same test: an expect re-indented where it stood, its body wrapped. */
  const inPlace = (r: Added) => (a: Added) =>
    a.file === r.file &&
    a.hunk === r.hunk &&
    owner(added, a) === owner(removed, r);
  const inTests = removed.filter((r) => isTest(r.file));
  const moved = new Set<Added>();
  // Each test's first line first, then the lines after it in its run of removed lines: an expect stays only when
  // its test's first line moved and it lands after it, or it lands where it stood, in the same test.
  const landedAt = new Map<Added, Added>();
  for (const r of starts(inTests)) {
    const a = land(r);
    if (a) {
      landedAt.set(r, a);
      moved.add(r);
    }
  }
  let home: Added | undefined;
  for (const [i, r] of inTests.entries()) {
    const prev = inTests[i - 1];
    if (prev?.file !== r.file || prev.hunk !== r.hunk) home = undefined;
    if (testName(r, inTests[i + 1]) !== undefined) home = landedAt.get(r);
    else if (
      EXPECT.test(code(r.text))
        ? (home && land(r, after(home))) || land(r, inPlace(r))
        : land(r)
    )
      moved.add(r);
  }
  const gone = inTests.filter((r) => !moved.has(r));
  const come = added.filter((a) => isTest(a.file) && !a.moved);
  for (const file of new Set(gone.map((l) => l.file))) {
    const out = gone.filter((l) => l.file === file);
    if (deleted.includes(file) && ![...moved].some((r) => r.file === file)) {
      if (tests(out).length || expects(out).length)
        say(file, "whole file", "the change deletes this test file");
      continue;
    }
    for (const hunk of new Set(out.map((l) => l.hunk))) {
      const was = out.filter((l) => l.hunk === hunk);
      const now = come.filter((l) => l.file === file && l.hunk === hunk);
      // A test keeps its name where it stands, or is renamed there with none of its expect lines removed; one
      // renamed as its expects go is rewritten, and removed under its old name.
      const named = pair(tests(was), tests(now), (t) => t.name);
      let renamed = named.left.length;
      const lost = named.lost.filter((t) => {
        const next = Math.min(
          ...tests(was)
            .filter((o) => o.line > t.line)
            .map((o) => o.line),
        );
        if (
          renamed === 0 ||
          expects(was).some((l) => l.line > t.line && l.line < next)
        )
          return true;
        renamed--;
        return false;
      });
      // An expect line after a removed test's start goes with it; one before belongs to a test that stays, and is
      // replaced by an expect rewritten in its run of lines, unless that one checks a constant.
      const first = Math.min(...lost.map((t) => t.line));
      const e = pair(
        expects(was.filter((l) => l.line < first)),
        expects(now),
        text,
      );
      const real = e.left.filter((l) => !CONSTANT.test(uncommented(l.text)));
      for (const l of e.lost.slice(real.length))
        say(
          file,
          `expect at line ${l.line}`,
          "the change removes this expect line (its line number before the change)",
        );
      for (const t of lost)
        say(file, t.name, "the change removes or rewrites this test");
    }
  }
  return problems;
}
