// Slice 0's proof: the tests and guards the gate runs. Test runs started at once leave each other's data alone and
// two gate runs started at once both pass, a pattern file naming a missing file fails the guards, an added product
// line no test runs is refused, and a new test that already passes on main is refused.

import { onSharedStack } from "../done-gate/shared-stack";
import { inScratch, sh, write } from "./scratch";
import type { Step } from "./step";
import { timeLeft } from "./time-limit";

const AT_ONCE = "services/worker/test/test-runs-at-once.test.ts";
const GATES_AT_ONCE = "scripts/done-gate-at-once.test.ts";
const tail = (out: string, n = 3) =>
  out.trim().split("\n").slice(-n).join(" / ");

/** `file`'s one test, run on the local stack with its settings (`bun run local`; nothing else of this run's is handed on). */
function passesOnStack(root: string, file: string) {
  const r = sh(root, ["bun", "run", "local", "bun", "test", file], { CI: "1" });
  if (r.status !== 0 || !/\b1 pass\b/.test(r.out) || !/\b0 fail\b/.test(r.out))
    throw new Error(
      `${file} did not pass (exit ${r.status}): ${tail(r.out, 12)}`,
    );
  return `${file} passed: ${tail(r.out, 4)}`;
}

export const twoRunsAtOnce: Step = {
  does: `Runs ${AT_ONCE} on the local stack, taking its turn on it as the gate's checks do: two test runs started at once (it starts four whole-suite runs and a demo together) must both pass and leave another company's rows and queued jobs untouched; then ${GATES_AT_ONCE}, where two gate runs started at once in two worktrees must both pass`,
  minutes: 45,
  check: ({ root }) =>
    onSharedStack(
      root,
      () =>
        `${passesOnStack(root, AT_ONCE)}; ${passesOnStack(root, GATES_AT_ONCE)}`,
      timeLeft(),
    ),
};

export const patternFileGuard: Step = {
  does: "Runs `bun run guards` (scripts/guards.sh) in a scratch clone, where it passes, then again with a pattern file naming a missing file (docs/patterns/proof-sample.md naming services/worker/src/no-such-file.ts), and checks that it fails naming that file",
  check: ({ root }) =>
    inScratch(root, ({ dir }) => {
      const before = sh(dir, ["bash", "scripts/guards.sh"]);
      if (before.status !== 0)
        throw new Error(
          `the guards fail before any change: ${tail(before.out)}`,
        );
      const missing = "services/worker/src/no-such-file.ts";
      write(
        dir,
        "docs/patterns/proof-sample.md",
        `# A sample pattern\n\nCopy the shape of \`${missing}\`.\n`,
      );
      const after = sh(dir, ["bash", "scripts/guards.sh"]);
      if (after.status === 0 || !after.out.includes(missing))
        throw new Error(
          `the guards ${after.status === 0 ? "passed" : `failed without naming ${missing}`}: ${tail(after.out)}`,
        );
      return `they passed, then failed: ${after.out
        .split("\n")
        .find((l) => l.includes(missing))
        ?.trim()}`;
    }),
};

// A small package for the two steps below, in a repository holding only the gate: the suite they run is its own.
const ONE = "export const one = () => 1;\n";
const ONE_TEST =
  'import { expect, test } from "bun:test";\nimport { one } from "../src/a";\n\ntest("one is one", () => expect(one()).toBe(1));\n';
const PACKAGE = {
  "packages/p/src/a.ts": ONE,
  "packages/p/test/a.test.ts": ONE_TEST,
};

export const unrunLine: Step = {
  does: "Adds a product function no test runs to a small package beside the gate, runs the gate's tests (`bun scripts/done-gate.ts tests`, as the gate and CI run them), and checks that the added product line no test runs is refused",
  check: ({ root }) =>
    inScratch(
      root,
      ({ dir }) => {
        write(
          dir,
          "packages/p/src/a.ts",
          `${ONE}\nexport function two(n: number) {\n  const doubled = n * 2;\n  return doubled;\n}\n`,
        );
        const r = sh(dir, ["bun", "scripts/done-gate.ts", "tests"]);
        if (r.status === 0 || !r.out.includes("packages/p/src/a.ts"))
          throw new Error(
            `the tests ${r.status === 0 ? "passed" : "failed without naming packages/p/src/a.ts"}: ${tail(r.out)}`,
          );
        return `refused: ${r.out
          .split("\n")
          .find((l) => l.includes("packages/p/src/a.ts"))
          ?.trim()}`;
      },
      PACKAGE,
    ),
};

export const passesOnMain: Step = {
  does: "Changes a small package beside the gate and adds a new test that already passes on main, runs the check that the change's tests fail on main (`bun scripts/done-gate.ts proven --base main`, as CI runs it), and checks that the test is refused",
  check: ({ root }) =>
    inScratch(
      root,
      ({ dir }) => {
        write(
          dir,
          "packages/p/src/a.ts",
          `${ONE}export const two = () => 2;\n`,
        );
        write(
          dir,
          "packages/p/test/b.test.ts",
          ONE_TEST.replace("one is one", "one is still one"),
        );
        const r = sh(dir, [
          "bun",
          "scripts/done-gate.ts",
          "proven",
          "--base",
          "main",
        ]);
        if (r.status !== 1 || !r.out.includes("one is still one"))
          throw new Error(
            `the check ${r.status === 0 ? "passed it" : `exited ${r.status} without naming the test`}: ${tail(r.out)}`,
          );
        return `refused: ${r.out
          .split("\n")
          .find((l) => l.includes("one is still one"))
          ?.trim()}`;
      },
      PACKAGE,
    ),
};
