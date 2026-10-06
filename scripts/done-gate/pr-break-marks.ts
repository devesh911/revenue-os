// A pull request's body quotes each break-check mark its change adds (break-marks.ts), so Devesh reads every gap
// where he reads the change: one line per mark, `Break-check mark: <file> · <why>`, exactly.

import { breakMarksIn, breakQuoteOf } from "./break-marks";
import type { Added } from "./diff";
import { shown } from "./rule-changes";

/** PURE: the change's added lines and the PR body → each mark no line of the body, as GitHub shows it, quotes. */
export function unquotedBreakMarks(added: Added[], body: string): string[] {
  const quotes = shown(body)
    .split(/\r?\n/)
    .map((l) => l.replace(/^(?:[-*+] )?/, "").trim());
  return breakMarksIn(added)
    .filter((m) => {
      const at = quotes.indexOf(breakQuoteOf(m));
      if (at >= 0) quotes.splice(at, 1); // each quote counts for one mark
      return at < 0;
    })
    .map(
      (m) =>
        `the PR body does not show the break-check mark at ${m.file}:${m.line}: add the line \`${breakQuoteOf(m)}\``,
    );
}
