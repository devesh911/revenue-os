// Console sign-in front door (RED) — the local dev login. Accounts are invite-only (no sign-up UI),
// so a developer on a fresh local stack needs ONE known account that `db:seed` creates and makes
// admin of the seeded orgs; then the console's email+password sign-in lands them on an org page.
// DB-backed: real local GoTrue + Postgres, and the real worker app for GET /orgs (like
// services/worker/test/orgs.test.ts). Modules under test are imported per test so each test fails
// for its own reason while scripts/dev-login.ts does not exist yet.
import { afterAll, describe, expect, it, spyOn } from "bun:test";
import { join } from "node:path";
import pg from "pg";
import { seed } from "./seed";

type DevLoginModule = {
  DEV_LOGIN_EMAIL: string;
  DEV_LOGIN_PASSWORD: string;
  ensureDevLogin: (opts: {
    supabaseUrl: string;
    anonKey: string;
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
  anonKey: ANON_KEY,
  dbUrl: LOCAL_DB_URL,
};

const admin = new pg.Pool({ connectionString: LOCAL_DB_URL, max: 2 });

// The create-path test can only run when the dev user does not exist yet (fresh stack / CI). A
// developer's long-lived local stack may already hold one; this suite never deletes it.
const devUserPreexisted =
  ((
    await admin.query(`select 1 from auth.users where email = $1`, [
      "dev@local.test",
    ])
  ).rowCount ?? 0) > 0;

afterAll(async () => {
  await admin.query(
    `delete from orgs where slug in ('seed-real-estate','seed-b2b-wholesale')`,
  );
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
  // When absent, the user is created through GoTrue's sign-up endpoint with the ANON key —
  // never an admin endpoint or a privileged key.
  it.skipIf(devUserPreexisted)(
    "creates the dev user via /auth/v1/signup with the anon key when absent",
    async () => {
      const { ensureDevLogin, DEV_LOGIN_EMAIL } = await load();
      const { orgId } = await seed("real_estate");
      const fetchSpy = spyOn(globalThis, "fetch");
      let userId = "";
      try {
        ({ userId } = await ensureDevLogin({ ...LOCAL_OPTS, orgIds: [orgId] }));
        const calls = fetchSpy.mock.calls.map(([input, init]) => ({
          url: urlOf(input),
          apikey: new Headers(
            input instanceof Request ? input.headers : init?.headers,
          ).get("apikey"),
        }));
        const signup = calls.filter((c) => c.url.includes("/auth/v1/signup"));
        expect(signup.length).toBeGreaterThan(0);
        expect(signup.every((c) => c.apikey === ANON_KEY)).toBe(true);
        expect(calls.some((c) => c.url.includes("/auth/v1/admin"))).toBe(false);
      } finally {
        fetchSpy.mockRestore();
      }
      const row = await admin.query(
        `select id from auth.users where email = $1`,
        [DEV_LOGIN_EMAIL],
      );
      expect(row.rows[0]?.id).toBe(userId);
    },
    20_000,
  );

  // After seed + ensureDevLogin, the dev credentials sign in and the worker lists every
  // seeded org with role admin — the exact path the console takes after sign-in.
  it("dev credentials sign in and GET /orgs lists every seeded org as admin", async () => {
    const { ensureDevLogin, DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD } =
      await load();
    const re = await seed("real_estate");
    const b2b = await seed("b2b_wholesale");
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
    const { orgId } = await seed("real_estate");
    const first = await ensureDevLogin({ ...LOCAL_OPTS, orgIds: [orgId] });
    const second = await ensureDevLogin({ ...LOCAL_OPTS, orgIds: [orgId] });
    expect(second.userId).toBe(first.userId);
    expect(await membership(orgId, second.userId)).toEqual([{ role: "admin" }]);
  }, 20_000);

  // "makes the user role 'admin'" — a membership that drifted to a lower role is put back.
  it("restores admin when the dev user's membership drifted to a lower role", async () => {
    const { ensureDevLogin } = await load();
    const { orgId } = await seed("real_estate");
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
  // Narrow source assertion: the seed CLI block imports from ./dev-login, calls
  // ensureDevLogin, and prints DEV_LOGIN_EMAIL so the developer knows what to sign in with.
  it("scripts/seed.ts CLI path calls ensureDevLogin and prints DEV_LOGIN_EMAIL", async () => {
    const src = await Bun.file(join(import.meta.dir, "seed.ts")).text();
    expect(src).toMatch(/(from\s+|import\s*\(\s*)["']\.\/dev-login["']/);
    const at = src.indexOf("if (import.meta.main)");
    expect(at).toBeGreaterThan(-1);
    const cli = src.slice(at);
    expect(cli).toContain("ensureDevLogin(");
    expect(cli).toContain("DEV_LOGIN_EMAIL");
  });
});
