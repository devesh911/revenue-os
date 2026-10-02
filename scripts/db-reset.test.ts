// The `bun run db:reset` wrapper's plan. PURE: buildResetPlan does no I/O, so these run with no stack (no
// supabase reset is ever executed inside `bun test`). The wrapper runs `supabase db reset`, then turns app_service's
// local login back on with the throwaway password the tests connect with (scripts/app-service-login.ts).
import { describe, expect, it } from "bun:test";
import { APP_SERVICE_LOCAL_PASSWORD } from "./app-service-login";
import { buildResetPlan } from "./db-reset";

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("db:reset wrapper composition", () => {
  it("composes exactly two ordered steps: `supabase db reset` THEN restore app_service login", () => {
    const plan = buildResetPlan(LOCAL_URL);
    expect(plan.local).toBe(true);
    expect(plan.steps.length).toBe(2);

    // step 1 — the reset itself (shell)
    expect(plan.steps[0]?.kind).toBe("shell");
    expect(plan.steps[0]?.command).toMatch(/supabase\s+db\s+reset/);

    // step 2 — restore app_service LOGIN with the local throwaway password (sql), AFTER reset
    expect(plan.steps[1]?.kind).toBe("sql");
    expect(plan.steps[1]?.command.toLowerCase()).toContain(
      "alter role app_service",
    );
    expect(plan.steps[1]?.command.toLowerCase()).toContain("login");
    expect(plan.steps[1]?.command).toContain(APP_SERVICE_LOCAL_PASSWORD);
  });

  it("the restore password is EXACTLY the one the tests log in with", () => {
    // If these drift, the reset leaves a database the tests cannot connect to. Pin them together.
    expect(APP_SERVICE_LOCAL_PASSWORD).toBe("app_service_local");
    const plan = buildResetPlan(LOCAL_URL);
    expect(
      plan.steps.some((s) => s.command.includes("app_service_local")),
    ).toBe(true);
  });

  it("refuses a NON-local database: this wrapper never resets staging or production", () => {
    expect(() =>
      buildResetPlan(
        "postgresql://app:secret@db.prod.example.com:5432/postgres",
      ),
    ).toThrow(/local/i);
  });
});
