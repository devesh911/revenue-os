// The ONE local dev login. Accounts are invite-only: the sign-in server refuses a self sign-up
// (supabase/config.toml), so `db:seed` makes this known account itself, directly in the local database as the local
// superuser (the same bootstrap posture as seed.ts), never through sign-up, an admin endpoint or a privileged key.
// It can sign in, is admin of the seeded orgs, and is on our operator list, so it may create a company.
// Playwright imports this under Node (the e2e specs): keep it and its imports free of Bun-only APIs.
import pg from "pg";
import { isLocalUrl } from "./local-url";

export const DEV_LOGIN_EMAIL = "dev@local.test";
export const DEV_LOGIN_PASSWORD = "revenue-os-local-dev";

/**
 * Makes the login `email` in the local database if it is missing (its user and its email identity, as the sign-in
 * server writes them; its profile follows from migration 011's trigger), then sets its password and confirms its
 * email, so it signs in with `password`. Its id. `db` is the local superuser; callers check the database is on this
 * machine.
 */
export async function ensureLocalUser(
  db: Pick<pg.ClientBase, "query">,
  email: string,
  password: string,
): Promise<string> {
  // The sign-in server reads the four token columns as text, so they are '' rather than null.
  await db.query(
    `with made as (
       insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1,
         '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
       on conflict do nothing
       returning id, email
     )
     insert into auth.identities (user_id, provider_id, provider, identity_data, created_at, updated_at)
     select id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now()
     from made`,
    [email],
  );
  // "Ensure" = the given credentials always work: reset the password (bcrypt via pgcrypto, which lives in
  // `extensions`, migration 014) and confirm the email if it is not yet.
  const user = await db.query<{ id: string }>(
    `update auth.users
     set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now())
     where email = $1 returning id`,
    [email, password],
  );
  const id = user.rows[0]?.id;
  if (!id) throw new Error(`local login ${email} not found`);
  return id;
}

export async function ensureDevLogin(opts: {
  supabaseUrl: string;
  dbUrl: string;
  orgIds: string[];
}): Promise<{ userId: string }> {
  if (!isLocalUrl(opts.supabaseUrl) || !isLocalUrl(opts.dbUrl))
    throw new Error("the dev login only exists on the local stack");

  const db = new pg.Client({ connectionString: opts.dbUrl });
  await db.connect();
  try {
    const userId = await ensureLocalUser(
      db,
      DEV_LOGIN_EMAIL,
      DEV_LOGIN_PASSWORD,
    );
    await db.query(
      `insert into org_members (org_id, user_id, role)
       select unnest($1::uuid[]), $2, 'admin'
       on conflict (org_id, user_id) do update set role = 'admin', expires_at = null`,
      [opts.orgIds, userId],
    );
    await db.query(
      `insert into platform_operators (user_id) values ($1) on conflict (user_id) do nothing`,
      [userId],
    );
    return { userId };
  } finally {
    await db.end();
  }
}
