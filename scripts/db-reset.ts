// `bun run db:reset`: `supabase db reset` re-applies every migration from scratch, which leaves app_service unable
// to log in (migration 010 in supabase/migrations; docs/decisions/D31-app-service-role-bootstrap.md), so
// the tests and the worker could not connect. This wrapper runs the reset, then turns that local login back on,
// so the database is ready for the tests in one step.
//
// buildResetPlan is pure (no I/O), so it is unit-tested without ever running a real reset; resetLocalDb is the
// thin command-line shell that carries the plan out (only through `bun run db:reset`).
import { execFileSync } from "node:child_process";
import pg from "pg";
import { APP_SERVICE_LOGIN_SQL } from "./app-service-login";
import { isLocalUrl } from "./local-url";

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
 * Compose the reset plan for `dbUrl`. PURE — no I/O. Refuses a database that is not on this machine (the one
 * check, scripts/local-url.ts): this tool never points at staging or production. Exactly two ordered steps:
 *   1. `supabase db reset`  (shell) — re-apply migrations
 *   2. `alter role app_service with login password '<local>'`  (sql) — turn the local login back on
 */
export function buildResetPlan(dbUrl: string): ResetPlan {
  if (!isLocalUrl(dbUrl)) {
    throw new Error("db:reset refuses to run against a non-local database");
  }
  return {
    local: true,
    steps: [
      // 1. re-apply migrations from scratch (leaves app_service unable to log in).
      { kind: "shell", command: "supabase db reset" },
      // 2. turn app_service's local login back on, with the throwaway password the tests connect with.
      { kind: "sql", command: APP_SERVICE_LOGIN_SQL },
    ],
  };
}

/**
 * CLI entry: build the plan for the local URL and execute each step in order. The `sql` step connects as the
 * LOCAL superuser (LOCAL_DB_URL, postgres) because app_service cannot change its own login. Never runs inside
 * `bun test` (buildResetPlan is the unit-tested surface).
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
