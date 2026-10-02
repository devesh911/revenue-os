// Every script that writes to a database, and the test setup, refuse one that is not on this machine, with the
// one check (scripts/local-url.ts): a look-alike host or a `?host=` override must not get through, as it did
// through the older copies that only searched the address for "127.0.0.1" or "localhost".
import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { buildResetPlan } from "./db-reset";

const repo = join(import.meta.dir, "..");
const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const NOT_LOCAL = [
  "postgresql://postgres:postgres@127.0.0.1.evil.invalid:54322/postgres",
  `${LOCAL}?host=db.remote.invalid`,
];

/** Runs `cmd` from the repo root with `env` on top of this run's, and returns its exit code and output. */
function run(cmd: string[], env: Record<string, string>) {
  const r = spawnSync(process.execPath, cmd, {
    cwd: repo,
    env: { ...process.env, VAPI_WEBHOOK_SECRET: "local-test-secret", ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe.each(NOT_LOCAL)("a database at %s is refused", (url) => {
  it("by the test setup, as the superuser address or the app's", () => {
    for (const key of ["LOCAL_DB_URL", "DATABASE_URL"]) {
      const r = run(["test", "scripts/local-url.test.ts"], { [key]: url });
      expect(r.out).toContain("refuses to run against a non-local database");
      expect(r.status).not.toBe(0);
    }
  });

  it("by db:reset", () => {
    expect(() => buildResetPlan(url)).toThrow(/non-local/);
  });

  it("by bun run evals", () => {
    const r = run(["scripts/evals.ts"], { DATABASE_URL: url });
    expect(r.out).toContain("refuses to run against a non-local database");
    expect(r.status).toBe(1);
  });

  it("by bun run demo, as the superuser address or the app's", () => {
    for (const key of ["LOCAL_DB_URL", "DATABASE_URL"]) {
      const r = run(["scripts/demo.ts"], { [key]: url });
      expect(r.out).toContain("refuses to run against a non-local database");
      expect(r.status).not.toBe(0);
    }
  });
});
