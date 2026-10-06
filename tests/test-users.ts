// The one way a test gets a signed-in person. Accounts are invite-only, so the sign-in server refuses a self
// sign-up: the login is made in the local database, as the dev login is (ensureLocalUser, scripts/dev-login.ts),
// then signed in through the real local sign-in server, whose token the worker checks as it checks anyone's.
// An operator is also put on our operator list (supabase/migrations/018_platform_operators.sql), so it may create a
// company. Playwright imports this under Node (apps/console/e2e): keep it free of Bun-only APIs.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

export type TestUser = { token: string; userId: string; email: string };

/** The access token the local sign-in server gives `email` for `password`, as the console's sign-in gets it. */
export async function signIn(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error(`sign-in failed: HTTP ${res.status}`);
  return body.access_token;
}

/**
 * A new signed-in person, `<tag>-<random>@example.com`; on our operator list when `operator` is set. `db` writes as
 * the local superuser (`postgres`).
 */
export async function testUser(
  db: Pick<Pool, "query">,
  tag: string,
  { operator = false } = {},
): Promise<TestUser> {
  const email = `${tag}-${randomUUID()}@example.com`;
  const password = `test-${randomUUID()}`;
  // Loaded when called, so a test file that uses this still loads where the dev login's code has no ensureLocalUser
  // (main's, before invite-only): there, the test fails at this call rather than its whole file failing to load.
  const { ensureLocalUser } = await import("../scripts/dev-login");
  const userId = await ensureLocalUser(db, email, password);
  if (operator)
    await db.query(`insert into platform_operators (user_id) values ($1)`, [
      userId,
    ]);
  return { token: await signIn(email, password), userId, email };
}
