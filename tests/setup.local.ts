// bun test preload (bunfig.toml): local/CI-only bootstrap.
// app_service is NOLOGIN by design (D31 draft) — tests flip it on with a throwaway local
// password. Refuses to touch anything that isn't the local stack.
import pg from "pg";

const url =
  process.env.LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/127\.0\.0\.1|localhost/.test(url)) {
  throw new Error(
    "tests/setup.local.ts refuses to run against a non-local database",
  );
}
const admin = new pg.Pool({ connectionString: url, max: 1 });
await admin.query(
  `alter role app_service with login password 'app_service_local'`,
);
await admin.end();
