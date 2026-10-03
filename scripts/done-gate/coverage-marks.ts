// Marks on product lines no test runs on purpose, written on the line itself: `// coverage gap: <why>` (a deliberate
// gap, or a line the coverage rule wrongly reports as not run), or `// coverage: browser-only (<browser test file>)`
// for console code only the browser checks reach. A mark alone on its line covers the line below it instead: in JSX,
// `{/* … */}` on the line above, where the formatter keeps it. Devesh sees every one: the done rules list each in the
// stop message and CI's log, and the pull request's body quotes each (pr-coverage-marks.ts).

import type { Added } from "./diff";

/** The files a mark counts in: .ts and .tsx files under apps, services and packages. */
export const MARKED = /^(apps|services|packages)\/.+\.tsx?$/;

export type Mark = { says: string; test?: string; bad?: string };

/** PURE: the mark a line carries, if any: what it says, the browser test it names, and why it does not hold. */
export function markOn(text: string): Mark | undefined {
  const m = text.match(
    /(?:\/\/|\/\*)\s*coverage(?:( gap:)|: browser-only)(.*?)\s*(?:\*\/\s*\}?\s*)?$/,
  );
  if (!m) return;
  const rest = (m[2] ?? "").trim();
  if (m[1])
    return {
      says: `coverage gap: ${rest}`,
      bad: /[\p{L}\p{N}]{3}/u.test(rest)
        ? undefined
        : "has a coverage mark without a reason: write `// coverage gap: <why>`",
    };
  const test = rest.match(/^\(([^()\s]+)\)$/)?.[1];
  return {
    says: `browser-only (${test ?? rest})`,
    test,
    bad: test
      ? undefined
      : "has a browser-only mark naming no browser test: write `// coverage: browser-only (<its .e2e.ts file>)`",
  };
}

/** PURE: the change's added lines → each mark on them, with its file and line. */
export const marksIn = (added: Added[]) =>
  added.flatMap((a) => {
    const mark = MARKED.test(a.file) ? markOn(a.text) : undefined;
    return mark ? [{ ...a, ...mark }] : [];
  });

/** PURE: the line of a pull request's body that quotes a mark. */
export const quoteOf = (m: { file: string; says: string }) =>
  `Coverage mark: ${m.file} · ${m.says}`;

/** PURE: one note per mark the change adds, for the stop message and CI's log, with the line the PR body owes it. */
export const markNotes = (added: Added[]) =>
  marksIn(added).map(
    (m) =>
      `coverage mark at ${m.file}:${m.line}: ${m.says} · the PR body quotes it: \`${quoteOf(m)}\``,
  );
