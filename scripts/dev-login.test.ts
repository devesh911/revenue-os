// Console sign-in front door — the local dev login. Accounts are invite-only (the sign-in server refuses a self
// sign-up), so a developer on a fresh local stack needs ONE known account that `db:seed` makes, admin of the seeded
// orgs and on our operator list; then the console's email+password sign-in lands them on an org page.
// DB-backed: real local GoTrue + Postgres, and the real worker app for GET /orgs (like
// services/worker/test/orgs.test.ts). The tests seed into workspaces of their own (the shared
// test-company helper), never into the dev login's own, and hold the dev login's lock
// (tests/dev-login-lock.ts) while they run, so another test run's dev-login tests wait their turn.
import { afterAll, describe, expect, it, spyOn } from "bun:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import pg from "pg";
import { holdDevLogin } from "../tests/dev-login-lock";
import { testCompanies } from "../tests/test-companies";
import { type Pack, seed } from "./seed";

type DevLoginModule = {
  DEV_LOGIN_EMAIL: string;
  DEV_LOGIN_PASSWORD: string;
  ensureLocalUser: (
    db: Pick<pg.ClientBase, "query">,
    email: string,
    password: string,
  ) => Promise<string>;
  ensureDevLogin: (opts: {
    supabaseUrl: string;
    dbUrl: string;
    orgIds: string[];
  }) => Promise<{ userId: string }>;
};
const load = async () =>
  (await import("./dev-login")) as unknown as DevLoginModule;

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_OPTS = {
  supabaseUrl: SUPABASE_URL,
  dbUrl: LOCAL_DB_URL,
};

const admin = new pg.Pool({ connectionString: LOCAL_DB_URL, max: 2 });
const companies = testCompanies(admin);
// Held from here to the end of the file, so nothing below sees another run change the dev login.
const devLogin = await holdDevLogin(LOCAL_DB_URL);

/** Seeds `pack` into a workspace of this file's own, never the dev login's. */
const seedOwn = async (pack: Pack) =>
  seed(pack, (await companies.add(`Dev login ${pack}`)).slug);

afterAll(async () => {
  await companies.cleanup();
  await devLogin.release();
  await admin.end();
});

async function passwordGrant(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token?: string };
  return { status: res.status, token: body.access_token };
}

async function membership(orgId: string, userId: string) {
  const r = await admin.query(
    `select role::text as role from org_members where org_id = $1 and user_id = $2`,
    [orgId, userId],
  );
  return r.rows as Array<{ role: string }>;
}

const urlOf = (input: unknown) =>
  typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : (input as Request).url;

describe("dev login constants", () => {
  // The fixed local dev credentials the console sign-in screen and docs point at.
  it("exports DEV_LOGIN_EMAIL and DEV_LOGIN_PASSWORD", async () => {
    const { DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD } = await load();
    expect(DEV_LOGIN_EMAIL).toBe("dev@local.test");
    expect(DEV_LOGIN_PASSWORD).toBe("revenue-os-local-dev");
  });
});

describe("ensureDevLogin refuses non-local targets before any I/O", () => {
  const cases = [
    {
      label: "hosted supabaseUrl",
      opts: { ...LOCAL_OPTS, supabaseUrl: "https://abcdefgh.supabase.invalid" },
    },
    {
      label: "hosted dbUrl",
      opts: {
        ...LOCAL_OPTS,
        dbUrl: "postgresql://postgres:x@db.prod.invalid:5432/postgres",
      },
    },
  ];
  for (const { label, opts } of cases) {
    // A non-local supabaseUrl or dbUrl is refused before any network or database call.
    it(`refuses a ${label} with no fetch and no DB connection`, async () => {
      const { ensureDevLogin } = await load();
      const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() =>
        Promise.reject(
          new Error("network is forbidden in this test"),
        )) as unknown as typeof fetch);
      const connectSpy = spyOn(pg.Client.prototype, "connect");
      try {
        await expect(
          (async () => ensureDevLogin({ ...opts, orgIds: [] }))(),
        ).rejects.toThrow(/local/i);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(connectSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
        connectSpy.mockRestore();
      }
    });
  }
});

describe("ensureDevLogin against the local stack", () => {
  // The sign-in server refuses a self sign-up, so a login is made in the local database: never through the sign-up
  // endpoint, an admin endpoint or a privileged key. A new address each run, so this runs on every stack, a developer's
  // long-lived one included, where the dev login already exists.
  it("makes a missing login in the local database, with no call to the sign-in server, and it signs in with its password", async () => {
    const { ensureLocalUser } = await load();
    const email = `made-locally-${randomUUID()}@example.com`;
    const fetchSpy = spyOn(globalThis, "fetch");
    let userId = "";
    try {
      userId = await ensureLocalUser(admin, email, "first-password-1");
      expect(fetchSpy.mock.calls.map(([input]) => urlOf(input))).toEqual([]);
    } finally {
      fetchSpy.mockRestore();
    }
    const profile = await admin.query(`select id from profiles where id = $1`, [
      userId,
    ]);
    expect(profile.rows).toEqual([{ id: userId }]);
    expect((await passwordGrant(email, "first-password-1")).status).toBe(200);
    // Run again with another password: the same login, and the new password is the one that works.
    expect(await ensureLocalUser(admin, email, "second-password-2")).toBe(
      userId,
    );
    expect((await passwordGrant(email, "first-password-1")).status).toBe(400);
    expect((await passwordGrant(email, "second-password-2")).status).toBe(200);
  }, 20_000);

  // Only our operator list may create a company (supabase/migrations/018_platform_operators.sql); the dev login is on
  // it, so a developer can make one through the product's own POST /orgs.
  it("puts the dev login on our operator list, so it may create a company through POST /orgs", async () => {
    const { ensureDevLogin, DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD } =
      await load();
    const { userId } = await ensureDevLogin({ ...LOCAL_OPTS, orgIds: [] });
    const listed = await admin.query(
      `select user_id from platform_operators where user_id = $1`,
      [userId],
    );
    expect(listed.rows).toEqual([{ user_id: userId }]);
    const { token } = await passwordGrant(DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD);
    const { default: app } = await import("../services/worker/src/index");
    let status = 0;
    await companies.add("Dev login's own company", async (name, slug) => {
      const res = await app.fetch(
        new Request("http://localhost/orgs", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ name, slug }),
        }),
      );
      status = res.status;
      return ((await res.json()) as { id: string }).id;
    });
    expect(status).toBe(201);
  }, 20_000);

  // After seed + ensureDevLogin, the dev credentials sign in and the worker lists every
  // seeded org with role admin — the exact path the console takes after sign-in.
  it("dev credentials sign in and GET /orgs lists every seeded org as admin", async () => {
    const { ensureDevLogin, DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD } =
      await load();
    const re = await seedOwn("real_estate");
    const b2b = await seedOwn("b2b_wholesale");
    const { userId } = await ensureDevLogin({
      ...LOCAL_OPTS,
      orgIds: [re.orgId, b2b.orgId],
    });
    const row = await admin.query(
      `select id from auth.users where email = $1`,
      [DEV_LOGIN_EMAIL],
    );
    expect(row.rows[0]?.id).toBe(userId);

    const grant = await passwordGrant(DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD);
    expect(grant.status).toBe(200);
    expect(typeof grant.token).toBe("string");

    const { default: app } = await import("../services/worker/src/index");
    const res = await app.fetch(
      new Request("http://localhost/orgs", {
        headers: { authorization: `Bearer ${grant.token}` },
      }),
    );
    expect(res.status).toBe(200);
    const orgs = (await res.json()) as Array<{ id: string; role: string }>;
    expect(orgs.find((o) => o.id === re.orgId)?.role).toBe("admin");
    expect(orgs.find((o) => o.id === b2b.orgId)?.role).toBe("admin");
  }, 20_000);

  // Idempotent — a second run reuses the same user and leaves exactly one membership row.
  it("a second ensureDevLogin succeeds, reuses the user, and keeps one membership row", async () => {
    const { ensureDevLogin } = await load();
    const { orgId } = await seedOwn("real_estate");
    const first = await ensureDevLogin({ ...LOCAL_OPTS, orgIds: [orgId] });
    const second = await ensureDevLogin({ ...LOCAL_OPTS, orgIds: [orgId] });
    expect(second.userId).toBe(first.userId);
    expect(await membership(orgId, second.userId)).toEqual([{ role: "admin" }]);
  }, 20_000);

  // "makes the user role 'admin'" — a membership that drifted to a lower role is put back.
  it("restores admin when the dev user's membership drifted to a lower role", async () => {
    const { ensureDevLogin } = await load();
    const { orgId } = await seedOwn("real_estate");
    const { userId } = await ensureDevLogin({ ...LOCAL_OPTS, orgIds: [orgId] });
    await admin.query(
      `update org_members set role = 'viewer' where org_id = $1 and user_id = $2`,
      [orgId, userId],
    );
    await ensureDevLogin({ ...LOCAL_OPTS, orgIds: [orgId] });
    expect(await membership(orgId, userId)).toEqual([{ role: "admin" }]);
  }, 20_000);
});

describe("db:seed CLI creates the dev login", () => {
  // The command a developer runs, pointed at a workspace of this file's own: it seeds it, makes the dev login its
  // admin, and prints the email to sign in with. Never at the dev login's own workspace, whose seed clean-up
  // deletes hand-made copies of the seed's people (supabase/seeds/real_estate.sql).
  it("`bun run db:seed real_estate <slug>` makes the dev login, admin of the seeded workspace, and prints its email", async () => {
    const { DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD } = await load();
    const own = await companies.add("Dev login CLI");
    const cli = spawnSync(
      process.execPath,
      ["run", "db:seed", "real_estate", own.slug],
      { cwd: join(import.meta.dir, ".."), encoding: "utf8" },
    );
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain(DEV_LOGIN_EMAIL);
    expect(
      (await passwordGrant(DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD)).status,
    ).toBe(200);
    const userId = (
      await admin.query(`select id from auth.users where email = $1`, [
        DEV_LOGIN_EMAIL,
      ])
    ).rows[0]?.id;
    expect(await membership(own.id, userId)).toEqual([{ role: "admin" }]);
    const seeded = await admin.query(
      `select count(*)::int n from contacts where org_id = $1`,
      [own.id],
    );
    expect(seeded.rows[0].n).toBeGreaterThan(0);
  }, 30_000);
});
