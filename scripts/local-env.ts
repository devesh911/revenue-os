// `bun run local <cmd>` — runs <cmd> with the env the worker, console and scripts need, read from
// the LOCAL Supabase stack (`supabase status -o env`), so nobody hand-copies keys. Only the ten
// LOCAL_ENV_KEYS are ever set: the privileged key and other status secrets never reach the child,
// and status output is captured, never echoed. Keys the caller already set (non-empty) win.
import { APP_SERVICE_LOCAL_PASSWORD } from "./db-reset";
import { isLocalUrl } from "./local-url";

export const LOCAL_ENV_KEYS = [
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "DATABASE_URL",
  "LOCAL_DB_URL",
  "PORT",
  "VITE_API_URL",
  "CORS_ORIGINS",
  "VAPI_WEBHOOK_SECRET",
] as const;

/** PURE: `supabase status -o env` text + the current env → only the missing LOCAL_ENV_KEYS. */
export function buildLocalEnv(
  statusEnvText: string,
  current: Record<string, string | undefined>,
): Record<string, string> {
  const read = (key: string) =>
    statusEnvText.match(new RegExp(`^${key}="?([^"\\n]*)"?$`, "m"))?.[1];
  const [api, anon, db] = [read("API_URL"), read("ANON_KEY"), read("DB_URL")];
  if (!api || !anon || !db)
    throw new Error(
      "local Supabase stack is not running — run `supabase start` first",
    );
  if (!isLocalUrl(api) || !isLocalUrl(db))
    throw new Error("local-env only targets the local Supabase stack");

  const appDb = new URL(db);
  appDb.username = "app_service";
  appDb.password = APP_SERVICE_LOCAL_PASSWORD;
  const port = current.PORT || "8080";
  const all: Record<(typeof LOCAL_ENV_KEYS)[number], string> = {
    SUPABASE_URL: api,
    VITE_SUPABASE_URL: api,
    SUPABASE_ANON_KEY: anon,
    VITE_SUPABASE_ANON_KEY: anon,
    DATABASE_URL: appDb.href,
    LOCAL_DB_URL: db,
    PORT: port,
    VITE_API_URL: `http://localhost:${port}`,
    CORS_ORIGINS: "http://localhost:5173,http://localhost:4173",
    VAPI_WEBHOOK_SECRET: "local-test-secret",
  };
  return Object.fromEntries(Object.entries(all).filter(([k]) => !current[k]));
}

if (import.meta.main) {
  const cmd = process.argv.slice(2);
  if (cmd.length === 0) {
    console.error("usage: bun run local <command> [args...]");
    process.exit(2);
  }
  let local: Record<string, string>;
  try {
    const status = Bun.spawnSync(["supabase", "status", "-o", "env"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (status.exitCode !== 0)
      throw new Error(
        "local Supabase stack is not running — run `supabase start` first",
      );
    local = buildLocalEnv(status.stdout.toString(), process.env);
  } catch (err) {
    console.error(`local-env: ${(err as Error).message}`);
    process.exit(1);
  }
  const child = Bun.spawn(cmd, {
    env: { ...process.env, ...local },
    stdio: ["inherit", "inherit", "inherit"],
  });
  // A launcher stopping the wrapper must stop the dev server too, or it orphans a strictPort.
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
    process.on(sig, () => child.kill(sig));
  process.exit(await child.exited);
}
