// Accounts are invite-only: the sign-in server refuses anyone who signs themselves up (supabase/config.toml, [auth]
// enable_signup = false), whether with a password or with an emailed code or link, while a login we made still signs
// in with its password. Against the real local sign-in server, with the public key the console ships.
import { afterAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ensureLocalUser } from "../scripts/dev-login";
import { signIn } from "./test-users";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const admin = new Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 1,
});
afterAll(() => admin.end());

const authPost = async (path: string, body: unknown) => {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as object };
};
const usersNamed = async (email: string) =>
  (await admin.query(`select id from auth.users where email = $1`, [email]))
    .rowCount;

describe("self sign-up is refused", () => {
  // behaviour already on main: the sign-in server's settings belong to the running local stack, which both copies share
  it("refuses a self sign-up with a password, and makes no login", async () => {
    const email = `self-signup-${randomUUID()}@example.com`;
    const tried = await authPost("/signup", {
      email,
      password: "a-password-of-my-own",
    });
    expect(tried.status).toBe(422);
    expect(tried.body).toMatchObject({ error_code: "signup_disabled" });
    expect(await usersNamed(email)).toBe(0);
  });

  // behaviour already on main: the sign-in server's settings belong to the running local stack, which both copies share
  it("refuses an emailed code or link to an address with no login, and makes no login", async () => {
    const email = `self-otp-${randomUUID()}@example.com`;
    const tried = await authPost("/otp", { email, create_user: true });
    expect(tried.status).toBe(422);
    expect(tried.body).toMatchObject({ error_code: "signup_disabled" });
    expect(await usersNamed(email)).toBe(0);
  });

  it("still signs in a login we made, with its password", async () => {
    const email = `made-for-them-${randomUUID()}@example.com`;
    await ensureLocalUser(admin, email, "their-password-1");
    expect((await signIn(email, "their-password-1")).split(".")).toHaveLength(
      3,
    );
  });
});
