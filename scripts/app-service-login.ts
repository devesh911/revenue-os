// Turns on the local login of app_service, the role the product's database access runs as. The migrations
// create it unable to log in (supabase/migrations/010_app_service_role.sql); on this machine it gets a throwaway
// password. Only when it can't log in yet: test runs used to rewrite it on every start, and runs started at the
// same moment then failed with "tuple concurrently updated".
import pg from "pg";
import { isLocalUrl } from "./local-url";

/** The throwaway local password: the local stack's own settings (scripts/local-env.ts) and CI log in with it. */
export const APP_SERVICE_LOCAL_PASSWORD = "app_service_local";
export const APP_SERVICE_LOGIN_SQL = `alter role app_service with login password '${APP_SERVICE_LOCAL_PASSWORD}'`;

async function canLogIn(appUrl: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: appUrl });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

/** Gives app_service its local login through the superuser at `adminUrl`, unless `appUrl` already logs in. */
export async function ensureAppServiceLogin(
  adminUrl: string,
  appUrl: string,
): Promise<void> {
  if (!isLocalUrl(adminUrl) || !isLocalUrl(appUrl))
    throw new Error("refuses to run against a non-local database");
  if (await canLogIn(appUrl)) return;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(APP_SERVICE_LOGIN_SQL);
  } catch (err) {
    // Another run, started at the same moment, turned it on first.
    if (!(await canLogIn(appUrl))) throw err;
  } finally {
    await admin.end();
  }
}
