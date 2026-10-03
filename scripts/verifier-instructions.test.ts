// The verifier's instructions (.claude/agents/verifier.md) keep the checks it runs on every change: each behaviour
// Devesh asked for, and each standard edge case, has a test at the layer people use (an API or browser test, not
// only a database test), and what one part writes passes the schema the part reading it uses. A real verifier run
// on a change with only a database test ruled FAIL and named the API test to add (the pull request's evidence).
import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The instructions as one line of words, so rewrapping a paragraph changes nothing here.
const words = readFileSync(
  join(import.meta.dir, "..", ".claude", "agents", "verifier.md"),
  "utf8",
).replace(/\s+/g, " ");

it("tells the verifier to find each behaviour's and edge case's test at the layer people use", () => {
  for (const phrase of [
    "find the test that exercises it at the layer people use",
    "an API test, which calls the worker's real routes",
    "a browser test in `apps/console/e2e/`",
    "it never counts alone",
    "another company: company B's user or rows never see or change company A's",
    "a duplicate: the same request, event or job twice does the work once",
    "empty input:",
    "a failure:",
    "a retry:",
    "rule FAIL and name the test to add: its file, its layer and the case",
  ])
    expect(words).toContain(phrase);
});

it("tells the verifier to parse what one part writes with the reading part's own schema", () => {
  for (const phrase of [
    "run the writer for real and parse what it wrote with the reader's own schema",
    "the shared Zod schema in",
    "Rule FAIL when it doesn't parse, or when no test makes the writer's real output pass the reader's schema",
  ])
    expect(words).toContain(phrase);
});
