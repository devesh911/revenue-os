// bun test preload (bunfig.toml): refuses to run unless every database and sign-in server the tests write to is on
// this machine (the one check, scripts/local-url.ts), then makes sure the tests can log in as app_service, writing
// that login only on a stack that doesn't have it yet (scripts/app-service-login.ts), so runs can start together.
import { ensureAppServiceLogin } from "../scripts/app-service-login";
import { isLocalUrl } from "../scripts/local-url";

const admin =
  process.env.LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const app =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";
const auth = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
if (![admin, app, auth].every(isLocalUrl))
  throw new Error(
    "tests/setup.local.ts refuses to run against a non-local database",
  );
await ensureAppServiceLogin(admin, app);
