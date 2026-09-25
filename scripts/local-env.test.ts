// Console sign-in front door (RED) — the local-env wrapper that turns `supabase status -o env`
// into the handful of variables the worker, console and scripts need, so a developer on a fresh
// local stack never hand-copies keys. buildLocalEnv is PURE (no I/O), so most of this runs env-free
// with FAKE status text — never real keys. The module is imported per test so each test fails for
// its own reason while scripts/local-env.ts does not exist yet.
import { describe, expect, it } from "bun:test";
import { join } from "node:path";

type LocalEnvModule = {
  buildLocalEnv: (
    statusEnvText: string,
    current: Record<string, string | undefined>,
  ) => Record<string, string>;
  LOCAL_ENV_KEYS: readonly string[];
};
const load = async () =>
  (await import("./local-env")) as unknown as LocalEnvModule;

// The privileged key's name is assembled at runtime (the docs/security.md S1.2 guard: the literal
// never appears here).
const PRIV_NAME = ["SERVICE", "ROLE", "KEY"].join("_");
const FAKE = {
  api: "http://127.0.0.1:54321",
  anon: "zzz-fake-anon-zzz",
  priv: "zzz-fake-priv-zzz",
  jwt: "zzz-fake-jwt-zzz",
  secret: "zzz-fake-sb-secret-zzz",
  s3: "zzz-fake-s3-zzz",
};
const status = (overrides: Record<string, string | null> = {}) => {
  const lines: Record<string, string | null> = {
    ANON_KEY: FAKE.anon,
    API_URL: FAKE.api,
    DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    GRAPHQL_URL: "http://127.0.0.1:54321/graphql/v1",
    JWT_SECRET: FAKE.jwt,
    MAILPIT_URL: "http://127.0.0.1:54324",
    PUBLISHABLE_KEY: "zzz-fake-publishable-zzz",
    S3_PROTOCOL_ACCESS_KEY_SECRET: FAKE.s3,
    SECRET_KEY: FAKE.secret,
    [PRIV_NAME]: FAKE.priv,
    STUDIO_URL: "http://127.0.0.1:54323",
    ...overrides,
  };
  return `${Object.entries(lines)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}="${v}"`)
    .join("\n")}\n`;
};

const EXPECTED_KEYS = [
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "DATABASE_URL",
  "LOCAL_DB_URL",
  "PORT",
  "VITE_API_URL",
  "CORS_ORIGINS",
  "VAPI_WEBHOOK_SECRET",
];
const EXPECTED_DEFAULTS: Record<string, string> = {
  SUPABASE_URL: FAKE.api,
  VITE_SUPABASE_URL: FAKE.api,
  SUPABASE_ANON_KEY: FAKE.anon,
  VITE_SUPABASE_ANON_KEY: FAKE.anon,
  DATABASE_URL:
    "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres",
  LOCAL_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  PORT: "8080",
  VITE_API_URL: "http://localhost:8080",
  CORS_ORIGINS: "http://localhost:5173,http://localhost:4173",
  VAPI_WEBHOOK_SECRET: "local-test-secret",
};

describe("buildLocalEnv — local stack status → app env (pure)", () => {
  // LOCAL_ENV_KEYS is exactly the ten keys the wrapper may set, nothing more.
  it("exports LOCAL_ENV_KEYS as exactly the ten allowed keys", async () => {
    const { LOCAL_ENV_KEYS } = await load();
    expect([...LOCAL_ENV_KEYS].sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  // With nothing preset, the result is exactly the ten keys with the documented values.
  it("fills every allowed key from the status text and local defaults", async () => {
    const { buildLocalEnv } = await load();
    expect(buildLocalEnv(status(), {})).toEqual(EXPECTED_DEFAULTS);
  });

  // Every other status line is ignored — the privileged key, JWT secret and secret keys never leak.
  it("never carries the privileged key or any other status secret, by name or value", async () => {
    const { buildLocalEnv } = await load();
    const result = buildLocalEnv(status(), {});
    const dump = JSON.stringify(result);
    expect(Object.keys(result).every((k) => EXPECTED_KEYS.includes(k))).toBe(
      true,
    );
    for (const needle of [
      PRIV_NAME,
      FAKE.priv,
      "JWT_SECRET",
      FAKE.jwt,
      "SECRET_KEY",
      FAKE.secret,
      FAKE.s3,
    ]) {
      expect(dump).not.toContain(needle);
    }
  });

  // A non-empty key already in `current` is never overridden (merge the result over current).
  it("never overrides a key that is already set", async () => {
    const { buildLocalEnv } = await load();
    const current = Object.freeze({
      SUPABASE_URL: "http://127.0.0.1:60001",
      VITE_SUPABASE_URL: "http://127.0.0.1:60002",
      SUPABASE_ANON_KEY: "preset-anon",
      VITE_SUPABASE_ANON_KEY: "preset-vite-anon",
      DATABASE_URL: "postgresql://preset@127.0.0.1:1/a",
      LOCAL_DB_URL: "postgresql://preset@127.0.0.1:1/b",
      PORT: "9999",
      VITE_API_URL: "http://localhost:1234",
      CORS_ORIGINS: "http://localhost:1",
      VAPI_WEBHOOK_SECRET: "preset-secret",
    });
    const result = buildLocalEnv(status(), current);
    expect({ ...current, ...result }).toEqual(current);
    expect(Object.keys(result).every((k) => EXPECTED_KEYS.includes(k))).toBe(
      true,
    );
  });

  // When PORT is preset, VITE_API_URL follows it instead of the 8080 default.
  it("VITE_API_URL follows a preset PORT", async () => {
    const { buildLocalEnv } = await load();
    const current = { PORT: "9090" };
    const merged = { ...current, ...buildLocalEnv(status(), current) };
    expect(merged.PORT).toBe("9090");
    expect(merged.VITE_API_URL).toBe("http://localhost:9090");
  });

  // An empty-string value counts as unset ("already set (non-empty)"), so it gets filled.
  it("treats an empty preset value as unset", async () => {
    const { buildLocalEnv } = await load();
    const result = buildLocalEnv(status(), { SUPABASE_URL: "", PORT: "" });
    expect(result.SUPABASE_URL).toBe(FAKE.api);
    expect(result.PORT).toBe("8080");
    expect(result.VITE_API_URL).toBe("http://localhost:8080");
  });

  // Pure — the answer depends only on its arguments, never on the process environment.
  it("reads `current`, not process.env", async () => {
    const { buildLocalEnv } = await load();
    const saved = process.env.PORT;
    process.env.PORT = "7777";
    try {
      expect(buildLocalEnv(status(), {}).PORT).toBe("8080");
    } finally {
      if (saved === undefined) delete process.env.PORT;
      else process.env.PORT = saved;
    }
  });

  // Accepts the localhost spelling of the local API URL too.
  it("accepts a localhost API_URL", async () => {
    const { buildLocalEnv } = await load();
    const result = buildLocalEnv(
      status({ API_URL: "http://localhost:54321" }),
      {},
    );
    expect(result.SUPABASE_URL).toBe("http://localhost:54321");
    expect(result.VITE_SUPABASE_URL).toBe("http://localhost:54321");
  });

  // Refuses a hosted (non-local) API_URL — this wrapper only ever targets the local stack.
  it("refuses a non-local API_URL", async () => {
    const { buildLocalEnv } = await load();
    expect(() =>
      buildLocalEnv(status({ API_URL: "https://abcdefgh.supabase.co" }), {}),
    ).toThrow(/local/i);
  });

  // "a 127.0.0.1/localhost URL" means the HOST is local — look-alike hostnames are refused.
  it("refuses look-alike hosts that merely contain 127.0.0.1 or localhost", async () => {
    const { buildLocalEnv } = await load();
    for (const api of [
      "http://127.0.0.1.evil.example:54321",
      "http://localhost.evil.example:54321",
    ]) {
      expect(() => buildLocalEnv(status({ API_URL: api }), {})).toThrow(
        /local/i,
      );
    }
  });

  // A missing API_URL tells the developer to run `supabase start`.
  it("missing API_URL throws a message naming `supabase start`", async () => {
    const { buildLocalEnv } = await load();
    expect(() => buildLocalEnv(status({ API_URL: null }), {})).toThrow(
      /supabase start/,
    );
  });

  // A missing ANON_KEY tells the developer to run `supabase start`.
  it("missing ANON_KEY throws a message naming `supabase start`", async () => {
    const { buildLocalEnv } = await load();
    expect(() => buildLocalEnv(status({ ANON_KEY: null }), {})).toThrow(
      /supabase start/,
    );
  });

  // Empty status output (stack not running) also points at `supabase start`.
  it("empty status text throws a message naming `supabase start`", async () => {
    const { buildLocalEnv } = await load();
    expect(() => buildLocalEnv("", {})).toThrow(/supabase start/);
  });
});

describe("`bun run local <cmd>` wiring (root package.json)", () => {
  const pkg = async () =>
    (await Bun.file(join(import.meta.dir, "../package.json")).json()) as {
      scripts: Record<string, string>;
    };

  // `bun run local <cmd>` wraps any command in the local env.
  it('package.json has "local": "bun scripts/local-env.ts"', async () => {
    expect((await pkg()).scripts.local).toBe("bun scripts/local-env.ts");
  });

  // db:seed runs through the wrapper so the seed CLI sees the local Supabase URL and anon key.
  it('"db:seed" runs through the wrapper', async () => {
    expect((await pkg()).scripts["db:seed"]).toBe(
      "bun scripts/local-env.ts bun scripts/seed.ts",
    );
  });

  // The wrapper actually wraps a command — injects the local env, leaks no privileged key,
  // and hands back the child's exit code untouched (a wrapper that swallows exit codes breaks gates).
  it("`bun scripts/local-env.ts <cmd>` runs the command with the local env and its exit code", () => {
    const base: Record<string, string | undefined> = { ...process.env };
    for (const k of [
      "PORT",
      "VITE_API_URL",
      "API_URL",
      "ANON_KEY",
      PRIV_NAME,
      "JWT_SECRET",
      "SECRET_KEY",
    ])
      delete base[k];
    const script = join(import.meta.dir, "local-env.ts");
    const probe = `const e = process.env; console.log(JSON.stringify({ port: e.PORT, api: e.VITE_API_URL, supa: e.VITE_SUPABASE_URL, leaked: [${JSON.stringify(PRIV_NAME)}, "JWT_SECRET", "SECRET_KEY"].filter((k) => k in e) })); process.exit(7);`;
    const r = Bun.spawnSync(
      [process.execPath, script, process.execPath, "-e", probe],
      {
        cwd: join(import.meta.dir, ".."),
        env: base,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(r.exitCode).toBe(7);
    const line = r.stdout.toString().trim().split("\n").pop() ?? "{}";
    const seen = JSON.parse(line) as {
      port?: string;
      api?: string;
      supa?: string;
      leaked?: string[];
    };
    expect(seen.port).toBe("8080");
    expect(seen.api).toBe("http://localhost:8080");
    expect(seen.supa ?? "").toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+/);
    expect(seen.leaked).toEqual([]);
  }, 30_000);
});
