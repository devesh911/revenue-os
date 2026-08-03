// task-60 (RED) — the reset-wrapper spec (criterion 6). PURE: buildResetPlan does no I/O, so these
// run env-free (no supabase reset is ever executed inside `bun test`). Each `it` derives from the
// brief: "runs supabase db reset THEN restores app_service login (the D31 alter role with the local
// throwaway password used by tests/setup.local.ts)".
import { describe, expect, it } from "bun:test";
import { APP_SERVICE_LOCAL_PASSWORD, buildResetPlan } from "./db-reset";

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("db:reset wrapper composition (task-60, criterion 6)", () => {
  it("composes exactly two ordered steps: `supabase db reset` THEN restore app_service login", () => {
    const plan = buildResetPlan(LOCAL_URL);
    expect(plan.local).toBe(true);
    expect(plan.steps.length).toBe(2);

    // step 1 — the reset itself (shell)
    expect(plan.steps[0]?.kind).toBe("shell");
    expect(plan.steps[0]?.command).toMatch(/supabase\s+db\s+reset/);

    // step 2 — restore app_service LOGIN with the D31 local throwaway password (sql), AFTER reset
    expect(plan.steps[1]?.kind).toBe("sql");
    expect(plan.steps[1]?.command.toLowerCase()).toContain(
      "alter role app_service",
    );
    expect(plan.steps[1]?.command.toLowerCase()).toContain("login");
    expect(plan.steps[1]?.command).toContain(APP_SERVICE_LOCAL_PASSWORD);
  });

  it("the restore password is EXACTLY the one tests/setup.local.ts logs in with (D31)", () => {
    // If these drift, the reset leaves a DB the preload cannot connect to. Pin them together.
    expect(APP_SERVICE_LOCAL_PASSWORD).toBe("app_service_local");
    const plan = buildResetPlan(LOCAL_URL);
    expect(
      plan.steps.some((s) => s.command.includes("app_service_local")),
    ).toBe(true);
  });

  it("refuses a NON-local database — this wrapper never resets staging/prod (S13.3)", () => {
    expect(() =>
      buildResetPlan(
        "postgresql://app:secret@db.prod.example.com:5432/postgres",
      ),
    ).toThrow(/local/i);
  });
});
