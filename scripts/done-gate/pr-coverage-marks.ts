// A pull request's body quotes each coverage mark its change adds (coverage-marks.ts), so Devesh reads every gap
// where he reads the change: one line per mark, `Coverage mark: <file> · <what the mark says>`, exactly.

import { marksIn, quoteOf } from "./coverage-marks";
import type { Added } from "./diff";
import { shown } from "./rule-changes";

/** PURE: the change's added lines and the PR body → each mark no line of the body, as GitHub shows it, quotes. */
export function unquotedMarks(added: Added[], body: string): string[] {
  const quotes = shown(body)
    .split(/\r?\n/)
    .map((l) => l.replace(/^(?:[-*+] )?/, "").trim());
  return marksIn(added)
    .filter((m) => {
      const at = quotes.indexOf(quoteOf(m));
      if (at >= 0) quotes.splice(at, 1); // each quote counts for one mark
      return at < 0;
    })
    .map(
      (m) =>
        `the PR body does not show the coverage mark at ${m.file}:${m.line}: add the line \`${quoteOf(m)}\``,
    );
}
