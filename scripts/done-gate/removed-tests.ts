// A removed test is a decision Devesh sees: a change that deletes a test file, a test (`it(` or `test(`) or an
// `expect` line, other than by moving it into a test file (moved.ts), names each one in a line it adds to
// docs/removed-tests.md, which the stop, CI's log and the PR body (pr-quotes.ts) all show. An expect or test replaced
// where it stood, in the same run of changed lines, is an edit, not a removal.

import { uncommented } from "./code-text";
import type { Added } from "./diff";

export const REMOVED_TESTS = "docs/removed-tests.md";
const ENTRY = /^(?:-\s+)?(\d{4}-\d{2}-\d{2} · .*)$/;

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

/** PURE: the name of the test a removed line starts, reading the next removed line when the formatter put it there. */
function testName(line: Added, next?: Added) {
  if (!CALL.test(code(line.text))) return;
  const own = uncommented(line.text).match(NAMED)?.[2];
  if (own !== undefined) return own;
  if (next?.file === line.file && next.line === line.line + 1)
    return next.text.match(/^\s*(["'`])((?:\\.|(?!\1).)*)\1/)?.[2];
}

/** PURE: `gone` without the ones paired with `come`: those whose key `come` holds first, then the rest in order. */
function unpaired<T>(gone: T[], come: string[], key: (t: T) => string) {
  const left = [...come];
  const rest = gone.filter((g) => {
    const i = left.indexOf(key(g));
    if (i >= 0) left.splice(i, 1);
    return i < 0;
  });
  return rest.slice(left.length);
}

/**
 * PURE: the change's removed and added lines (`isTest` says which files hold tests), the files it deletes and the
 * entries it adds to docs/removed-tests.md → a problem for each test file, test or expect line it removes that no
 * entry names. A test file deleted with nothing moved out of it into a test file is named once, whole; an expect line
 * after a removed test's start is covered by the test's entry.
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
      [target, `${file} > whole file`].some((t) => {
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
  // A line moved out of a test file stays a test only if it lands in one: moved into a note, it is removed.
  const landed = new Map<string, number>();
  for (const a of added)
    if (a.moved && isTest(a.file))
      landed.set(text(a), (landed.get(text(a)) ?? 0) + 1);
  const stays = (r: Added) => {
    const n = r.moved ? (landed.get(text(r)) ?? 0) : 0;
    if (n) landed.set(text(r), n - 1);
    return n > 0;
  };
  const moved = new Set(removed.filter((r) => isTest(r.file) && stays(r)));
  const gone = removed.filter((r) => isTest(r.file) && !moved.has(r));
  const come = added.filter((a) => isTest(a.file) && !a.moved);
  const tests = (lines: Added[]) =>
    lines.flatMap((l, i) => {
      const name = testName(l, lines[i + 1]);
      return name === undefined ? [] : [{ name, line: l.line }];
    });
  const expects = (lines: Added[]) =>
    lines.filter((l) => EXPECT.test(code(l.text)));
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
      const lost = unpaired(
        tests(was),
        tests(now).map((t) => t.name),
        (t) => t.name,
      );
      // An expect line after a removed test's start goes with it; one before belongs to a test that stays.
      const first = Math.min(...lost.map((t) => t.line));
      const lines = unpaired(
        expects(was.filter((l) => l.line < first)),
        expects(now).map(text),
        text,
      );
      for (const l of lines)
        say(
          file,
          `expect at line ${l.line}`,
          "the change removes this expect line (its line number before the change)",
        );
      for (const t of lost) say(file, t.name, "the change removes this test");
    }
  }
  return problems;
}
