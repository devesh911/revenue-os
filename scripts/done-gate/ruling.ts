// The verifier's ruling as its delivered report states it: the report's last line, in the one fixed form
// .claude/agents/verifier.md tells it to write.

import type { Ruling } from "./verdict";

const VERDICTS = {
  PASS: "pass",
  FAIL: "fail",
  CANNOT_VERIFY: "cannot-verify",
} as const;

/** The three forms, as the verifier is told them when the gate refuses a report without one. */
export const RULING_FORMS =
  "`Ruling: PASS — <what you saw>`, `Ruling: FAIL — <what the builder must fix>` or `Ruling: CANNOT_VERIFY — <exactly what only Devesh can provide>`";

/** PURE: a report → the ruling its last non-empty line states, or nothing when that line is not in the fixed form. */
export function rulingOf(report: string): Ruling | undefined {
  const last = report.trimEnd().split("\n").at(-1)?.trim() ?? "";
  const [, word, note] =
    last.match(/^Ruling: (PASS|FAIL|CANNOT_VERIFY) — (\S.*)$/) ?? [];
  return word && note
    ? { verdict: VERDICTS[word as keyof typeof VERDICTS], note }
    : undefined;
}
