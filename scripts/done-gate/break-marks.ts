// Marks on guardrail, tenancy or money lines whose deliberate break no test notices on purpose (break-check.ts):
// `// break-check gap: <why>`, at the end of the line or alone on the comment line above it. Devesh sees every one:
// the done rules list each in the stop message and CI's log, and the pull request's body quotes each, one line per
// mark, `Break-check mark: <file> · <why>`, exactly (pr-break-marks.ts).

import { kindOf } from "./broken-lines";
import type { Added } from "./diff";

/** PURE: the reason a line's break-check mark gives, "" for a mark without one, undefined for no mark. */
export const breakMarkOn = (text: string) =>
  text.match(/\/\/\s*break-check gap:(.*)$/)?.[1]?.trim();

/** PURE: does a mark's reason say something (three letters or digits in a row)? */
export const saysWhy = (why: string) => /[\p{L}\p{N}]{3}/u.test(why);

/** PURE: the change's added lines → each break-check mark on them in guarded code, with its file, line and reason. */
export const breakMarksIn = (added: Added[]) =>
  added.flatMap((a) => {
    const why = kindOf(a.file) ? breakMarkOn(a.text) : undefined;
    return why === undefined ? [] : [{ file: a.file, line: a.line, why }];
  });

/** PURE: the line of a pull request's body that quotes a mark. */
export const breakQuoteOf = (m: { file: string; why: string }) =>
  `Break-check mark: ${m.file} · ${m.why}`;

/** PURE: one note per mark the change adds, for the stop message and CI's log, with the line the PR body owes it. */
export const breakMarkNotes = (added: Added[]) =>
  breakMarksIn(added).map(
    (m) =>
      `break-check mark at ${m.file}:${m.line}: ${m.why || "(no reason given)"} · the PR body quotes it: \`${breakQuoteOf(m)}\``,
  );
