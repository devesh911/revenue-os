// task-60 — the `bun run db:reset` wrapper surface (RED phase: implementation-free stub).
//
// `supabase db reset` re-applies migrations from scratch, and (D31) app_service is created NOLOGIN
// by design — so after a bare reset the whole test suite cannot connect. This wrapper runs the
// reset THEN restores app_service login with the local throwaway password tests/setup.local.ts
// uses, so `bun run db:reset` leaves a suite-ready database in one shot.
//
// buildResetPlan is a PURE composition (no I/O) so it is unit-testable without ever running a real
// reset. resetLocalDb is the thin CLI shell that executes the plan (only via `bun run db:reset`).
import { execFileSync } from "node:child_process";
import pg from "pg";

/** The local throwaway password D31 grants app_service so the test preload can log in. */
export const APP_SERVICE_LOCAL_PASSWORD = "app_service_local";

/** Mirrors seed.ts's guard (S13.3): this tool never points at staging/prod, only the local stack. */
function isLocalUrl(dbUrl: string): boolean {
  return /127\.0\.0\.1|localhost/.test(dbUrl);
}

/** One step of the reset plan: a shell command or a SQL statement, applied in array order. */
export interface ResetStep {
  kind: "shell" | "sql";
  command: string;
}

/** The composed plan: whether the target is local (guard) and the ordered steps to run. */
export interface ResetPlan {
  local: boolean;
  steps: ResetStep[];
}

/**
 * Compose the reset plan for `dbUrl`. PURE — no I/O. Refuses a non-local URL (mirrors seed.ts /
 * setup.local.ts: this tool never points at staging/prod). The plan is exactly two ordered steps:
 *   1. `supabase db reset`  (shell) — re-apply migrations
 *   2. `alter role app_service with login password '<local>'`  (sql) — restore login (D31)
 */
export function buildResetPlan(dbUrl: string): ResetPlan {
  if (!isLocalUrl(dbUrl)) {
    throw new Error("db:reset refuses to run against a non-local database");
  }
  return {
    local: true,
    steps: [
      // 1. re-apply migrations from scratch (leaves app_service NOLOGIN — D31).
      { kind: "shell", command: "supabase db reset" },
      // 2. restore app_service LOGIN with the local throwaway password the preload connects with,
      //    so the whole suite can reach the DB again in one shot.
      {
        kind: "sql",
        command: `alter role app_service with login password '${APP_SERVICE_LOCAL_PASSWORD}'`,
      },
    ],
  };
}

/**
 * CLI entry: build the plan for the local URL and execute each step in order. The `sql` restore
 * connects as the LOCAL superuser (LOCAL_DB_URL — postgres) because app_service cannot alter its
 * own role attributes. Never runs inside `bun test` (buildResetPlan is the unit-tested surface).
 */
export async function resetLocalDb(dbUrl?: string): Promise<void> {
  const url =
    dbUrl ??
    process.env.LOCAL_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const plan = buildResetPlan(url); // throws before any side effect on a non-local URL
  for (const step of plan.steps) {
    if (step.kind === "shell") {
      const [cmd, ...args] = step.command.split(/\s+/);
      execFileSync(cmd as string, args, { stdio: "inherit" });
    } else {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      try {
        await client.query(step.command);
      } finally {
        await client.end();
      }
    }
  }
}

if (import.meta.main) {
  await resetLocalDb();
  console.log(
    "db:reset — migrations re-applied and app_service login restored",
  );
}
