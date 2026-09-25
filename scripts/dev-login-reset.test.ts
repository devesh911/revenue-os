// AC-L2 follow-up to the RED dev-login suite (kept in its own file so scripts/dev-login.test.ts stays
// exactly as reviewed): "ensure" means the documented credentials always work on the local stack —
// an existing dev user whose password was changed signs in with DEV_LOGIN_PASSWORD again afterwards.
// DB-backed: real local GoTrue + Postgres.
import { afterAll, expect, it } from "bun:test";
import pg from "pg";
import {
  DEV_LOGIN_EMAIL,
  DEV_LOGIN_PASSWORD,
  ensureDevLogin,
} from "./dev-login";
import { seed } from "./seed";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const admin = new pg.Pool({ connectionString: LOCAL_DB_URL, max: 1 });

afterAll(async () => {
  await admin.query(`delete from orgs where slug = 'seed-real-estate'`);
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

it("AC-L2: resets a changed dev user password so DEV_LOGIN_PASSWORD signs in again", async () => {
  const opts = {
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON_KEY,
    dbUrl: LOCAL_DB_URL,
    orgIds: [(await seed("real_estate")).orgId],
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
