// task-60 (RED) — the `bun run demo` + `bun run db:reset` WIRING spec. PURE: reads package.json off
// disk, no DB. Derives from the brief: "a new `bun run demo` script (scripts/demo.ts, plus a
// package.json script entry)" and criterion 6's reset wrapper (db:reset must route through the
// login-restoring wrapper, not bare `supabase db reset`).
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(
  readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
) as { scripts?: Record<string, string> };
const scripts = pkg.scripts ?? {};

describe("package.json wiring (task-60)", () => {
  it("exposes `bun run demo`, running scripts/demo.ts (criterion: the new demo script)", () => {
    expect(scripts.demo).toBeDefined();
    expect(scripts.demo).toMatch(/scripts\/demo\.ts/);
  });

  it("`db:reset` routes through the login-restoring wrapper, not bare `supabase db reset` (criterion 6)", () => {
    // A bare `supabase db reset` leaves app_service NOLOGIN (D31) and breaks the whole suite. The
    // wrapper (scripts/db-reset.ts) must own db:reset so the restore always runs.
    expect(scripts["db:reset"]).toBeDefined();
    expect(scripts["db:reset"]).toMatch(/scripts\/db-reset\.ts/);
    expect(scripts["db:reset"]).not.toBe("supabase db reset");
  });
});
