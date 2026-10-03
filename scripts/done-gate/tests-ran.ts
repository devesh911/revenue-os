// `bun run gate tests [e2e]`: bun's tests or the browser checks, as CI runs them, failing if any test did not run.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests allowed not to run, as "file > name", and why. Any other test that bun or Playwright reports as skipped
// or todo fails the tests or browser checks (`bun run gate tests`), however it was switched off.
export const MAY_SKIP: Record<string, string> = {
  "scripts/dev-login.test.ts > creates the dev user via /auth/v1/signup with the anon key when absent":
    "it runs only where the dev login does not exist yet, as in CI",
};

/** PURE: a JUnit report, bun's or Playwright's → every test it lists as skipped or todo, as "file > name". */
export function notRun(report: string): string[] {
  const entity: Record<string, string> = {
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    amp: "&",
  };
  const text = (s = "") =>
    s.replace(/&(quot|apos|lt|gt|amp);/g, (_, e: string) => entity[e] ?? _);
  return [
    ...report.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g),
  ]
    .filter(([, , body = ""]) => body.includes("<skipped"))
    .map(([, attrs = ""]) => {
      const attr = (k: string) =>
        text(attrs.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1]);
      return `${attr("file") || attr("classname")} > ${attr("name")}`;
    });
}

/**
 * `bun run gate tests [e2e]`: bun's tests, or the browser checks, as CI runs them (CI=1, so bun and Playwright
 * refuse .only), then fails if any test was skipped or left todo, however it was switched off, unless MAY_SKIP
 * lists it.
 */
export function allTestsRun(repo: string, e2e: boolean): number {
  const dir = mkdtempSync(join(tmpdir(), "done-gate-tests-"));
  const report = join(dir, "junit.xml");
  try {
    const r = spawnSync(
      process.execPath,
      e2e
        ? ["run", "e2e", "--reporter=list,junit"]
        : ["test", "--reporter=junit", `--reporter-outfile=${report}`],
      {
        cwd: repo,
        stdio: "inherit",
        env: { ...process.env, CI: "1", PLAYWRIGHT_JUNIT_OUTPUT_FILE: report },
      },
    );
    const off = notRun(
      existsSync(report) ? readFileSync(report, "utf8") : "",
    ).filter((t) => !(t in MAY_SKIP));
    if (off.length)
      console.error(
        `✗ ${off.length} test(s) did not run (skipped or todo):\n${off.map((t) => `- ${t}`).join("\n")}\nMake each one run. One that truly can't run everywhere goes in MAY_SKIP in scripts/done-gate/tests-ran.ts, with why; Devesh sees that change.`,
      );
    return (r.status ?? 1) || (off.length ? 1 : 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
