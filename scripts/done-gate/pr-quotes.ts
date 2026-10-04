// A pull request's body shows Devesh what the change asks him to accept: each `done-gate: allow` exception it adds,
// as a line `Exception: <file> · <why>`, and each line it adds to docs/removed-tests.md, copied as it is. Main's copy
// judges it (pr.ts), so rules-from-main refuses a body that leaves one out, or hides it where GitHub shows nothing.

import { shown } from "./rule-changes";
import type { Exception } from "./rules";

/** PURE: the exceptions and docs/removed-tests.md entries a change adds, and its PR body → what the body must still show. */
export function quoteProblems(
  exceptions: Exception[],
  entries: string[],
  body: string,
) {
  const lines = new Set(
    shown(body)
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^-\s+/, "")),
  );
  return [
    ...exceptions
      .map((e) => ({ e, line: `Exception: ${e.file} · ${e.why}` }))
      .filter(({ line }) => !lines.has(line))
      .map(
        ({ e, line }) =>
          `the PR body does not show the exception at ${e.file}:${e.line}: add the line \`${line}\``,
      ),
    ...entries
      .filter((e) => !lines.has(e))
      .map(
        (e) =>
          `the PR body does not copy a line docs/removed-tests.md gains: add \`${e}\``,
      ),
  ];
}
