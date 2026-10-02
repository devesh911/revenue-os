// A follow-up to the dev-login suite (scripts/dev-login.test.ts): "ensure" means the documented
// credentials always work on the local stack — an existing dev user whose password was changed
// signs in with DEV_LOGIN_PASSWORD again afterwards. DB-backed: real local GoTrue + Postgres. It
// holds the dev login's lock (tests/dev-login-lock.ts) while it changes the password, so another
// test run never signs in with the dev login in between, and it makes the dev login admin of no workspace.
import { afterAll, beforeAll, expect, it } from "bun:test";
import pg from "pg";
import { holdDevLogin } from "../tests/dev-login-lock";
import {
  DEV_LOGIN_EMAIL,
  DEV_LOGIN_PASSWORD,
  ensureDevLogin,
} from "./dev-login";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const admin = new pg.Pool({ connectionString: LOCAL_DB_URL, max: 1 });
let devLogin: Awaited<ReturnType<typeof holdDevLogin>>;

beforeAll(async () => {
  devLogin = await holdDevLogin(LOCAL_DB_URL);
});

afterAll(async () => {
  await devLogin.release();
  await admin.end();
});

const grantStatus = async (password: string) =>
  (
    await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ email: DEV_LOGIN_EMAIL, password }),
    })
  ).status;

it("resets a changed dev user password so DEV_LOGIN_PASSWORD signs in again", async () => {
  const opts = {
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON_KEY,
    dbUrl: LOCAL_DB_URL,
    orgIds: [],
  };
  await ensureDevLogin(opts);
  await admin.query(
    `update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf'))
     where email = $1`,
    [DEV_LOGIN_EMAIL, "a-different-password"],
  );
  expect(await grantStatus(DEV_LOGIN_PASSWORD)).toBe(400);
  await ensureDevLogin(opts);
  expect(await grantStatus(DEV_LOGIN_PASSWORD)).toBe(200);
}, 20_000);
