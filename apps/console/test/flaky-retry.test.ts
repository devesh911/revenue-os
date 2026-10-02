// A browser test that passes only on a retry fails the CI run: the browser checks' Playwright settings
// (apps/console/playwright.config.ts, which also runs the marketing site's checks) retry in CI, and a test that
// needed the retry must turn the run red, not slip into a green check. Runs a real Playwright run of a test that
// fails its first try (flaky-retry/), with no server and no browser.
import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "../../..");

it("a browser test that passes only on its retry fails the CI run", () => {
  const out = mkdtempSync(join(tmpdir(), "flaky-retry-"));
  // Never this run's JUnit report: the gate points that variable at the report of the run it checks.
  const { PLAYWRIGHT_JUNIT_OUTPUT_FILE: _, ...env } = process.env;
  try {
    const r = spawnSync(
      join(repo, "node_modules/.bin/playwright"),
      [
        "test",
        "-c",
        join(import.meta.dir, "flaky-retry/retry.config.ts"),
        `--output=${out}`,
      ],
      {
        cwd: repo,
        encoding: "utf8",
        env: { ...env, CI: "1" },
        timeout: 120_000,
      },
    );
    expect(`${r.stdout}${r.stderr}`).toMatch(/1 flaky/);
    expect(r.status).toBe(1);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}, 120_000);
