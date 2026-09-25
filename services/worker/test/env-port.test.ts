// Console sign-in front door (RED) — the worker's listen port comes from env (PORT), not a literal,
// so the local wrapper, the console's VITE_API_URL and the worker always agree on one number.
// The env module parses process.env at import, so run this suite with the local stack env set
// (as CI does). Imported per test so each test fails for its own reason.
import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const REQUIRED = {
  DATABASE_URL: "postgresql://app_service:x@127.0.0.1:54322/postgres",
  SUPABASE_URL: "http://127.0.0.1:54321",
};
const parsePort = async (extra: Record<string, unknown>) => {
  const { EnvSchema } = await import("../src/env");
  return (EnvSchema.parse({ ...REQUIRED, ...extra }) as { PORT?: unknown })
    .PORT;
};

describe("worker env PORT", () => {
  // A string PORT (how process.env delivers it) is coerced to an integer.
  it('PORT "8787" parses to the number 8787', async () => {
    expect(await parsePort({ PORT: "8787" })).toBe(8787);
  });

  // A numeric PORT is accepted as-is.
  it("PORT 8787 (number) parses to 8787", async () => {
    expect(await parsePort({ PORT: 8787 })).toBe(8787);
  });

  // Absent PORT defaults to 8080.
  it("absent PORT defaults to 8080", async () => {
    expect(await parsePort({})).toBe(8080);
  });

  // "coerced to int" — garbage or fractional ports are refused (the worker refuses to boot
  // half-configured), never silently NaN.
  it("a non-integer PORT is rejected", async () => {
    const { EnvSchema } = await import("../src/env");
    for (const PORT of ["not-a-port", "80.5"]) {
      expect(() => EnvSchema.parse({ ...REQUIRED, PORT })).toThrow();
    }
  });

  // The worker's default export listens on env.PORT — run in a child process with PORT=8787.
  it("the worker default export's port follows PORT from the environment", () => {
    const entry = join(import.meta.dir, "../src/index.ts");
    const r = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        `const m = await import(${JSON.stringify(entry)}); console.log(JSON.stringify({ port: m.default.port }));`,
      ],
      { env: { ...process.env, PORT: "8787" }, stdout: "pipe", stderr: "pipe" },
    );
    if (r.exitCode !== 0)
      throw new Error(
        `worker import failed: ${r.stderr.toString().slice(0, 500)}`,
      );
    const line = r.stdout.toString().trim().split("\n").pop() ?? "{}";
    expect((JSON.parse(line) as { port?: unknown }).port).toBe(8787);
  }, 20_000);
});
