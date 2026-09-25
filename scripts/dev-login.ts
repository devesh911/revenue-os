// The ONE local dev login. Accounts are invite-only (no sign-up UI), so `db:seed` ensures this
// known account exists, can sign in, and is admin of the seeded orgs. LOCAL stack only: the user
// is created through GoTrue sign-up with the anon key (never an admin endpoint or privileged key);
// the rest runs as the local superuser, the same bootstrap posture as seed.ts.
// Playwright imports this under Node (the e2e specs): keep it and its imports free of Bun-only APIs.
import pg from "pg";
import { isLocalUrl } from "./local-url";

export const DEV_LOGIN_EMAIL = "dev@local.test";
export const DEV_LOGIN_PASSWORD = "revenue-os-local-dev";

export async function ensureDevLogin(opts: {
  supabaseUrl: string;
  anonKey: string;
  dbUrl: string;
  orgIds: string[];
}): Promise<{ userId: string }> {
  if (!isLocalUrl(opts.supabaseUrl) || !isLocalUrl(opts.dbUrl))
    throw new Error("the dev login only exists on the local stack");

  const res = await fetch(`${opts.supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: opts.anonKey },
    body: JSON.stringify({
      email: DEV_LOGIN_EMAIL,
      password: DEV_LOGIN_PASSWORD,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error_code?: string;
      msg?: string;
    };
    if (body.error_code !== "user_already_exists")
      throw new Error(
        `dev login sign-up failed: ${res.status} ${body.msg ?? ""}`,
      );
  }

  const db = new pg.Client({ connectionString: opts.dbUrl });
  await db.connect();
  try {
    // "Ensure" = the documented credentials always work: reset the password (bcrypt via pgcrypto,
    // which lives in `extensions` — migration 014) and confirm the email if it is not yet.
    const user = await db.query<{ id: string }>(
      `update auth.users
       set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now())
       where email = $1 returning id`,
      [DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD],
    );
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error(`dev login ${DEV_LOGIN_EMAIL} not found`);
    await db.query(
      `insert into org_members (org_id, user_id, role)
       select unnest($1::uuid[]), $2, 'admin'
       on conflict (org_id, user_id) do update set role = 'admin', expires_at = null`,
      [opts.orgIds, userId],
    );
    return { userId };
  } finally {
    await db.end();
  }
}
