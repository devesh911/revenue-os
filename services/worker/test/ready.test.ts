// The worker's readiness check (GET /ready) and release endpoint (GET /release), services/worker/src/ready.ts, over
// HTTP on the real local database and real pg-boss (in a schema of this test's own, fixtures/test-job-schema.ts).
// The database is taken away for real: a pool pointed at a port nothing listens on, one at a server that accepts and
// never answers, and one through a relay this test cuts and then restores. The job queue is taken away by stopping
// the worker's own job runner, then started again.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type AddressInfo, connect, createServer, type Socket } from "node:net";
import pg from "pg";
import { pool } from "../src/db";
import { EnvSchema } from "../src/env";
import { jobQueueReachable, startJobs, stopJobs } from "../src/jobs";
import { databaseReachable, opsRoutes } from "../src/ready";
import { testJobSchema } from "./fixtures/test-job-schema";

const TOKEN = "r".repeat(64);
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";
const DB_HOST = new URL(DB_URL).host;
const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 1,
});
let jobs: Awaited<ReturnType<typeof testJobSchema>>;

beforeAll(async () => {
  jobs = await testJobSchema(admin);
  await startJobs(jobs.settings);
}, 30_000);
afterAll(async () => {
  await stopJobs();
  await jobs?.drop();
  await admin.end();
});

/** A pool of the test's own at `host` (host:port), which outlives the connections taken from under it. */
function poolAt(host: string) {
  const p = new pg.Pool({
    connectionString: DB_URL.replace(`@${DB_HOST}`, `@${host}`),
    max: 2,
  });
  p.on("error", () => {});
  return p;
}

/** Listens on a free local port; `close` drops every connection it took. */
async function listener(onConnection: (s: Socket) => void) {
  const sockets = new Set<Socket>();
  const server = createServer((s) => {
    sockets.add(s);
    s.on("error", () => {});
    s.on("close", () => sockets.delete(s));
    onConnection(s);
  });
  const listen = (port: number) =>
    new Promise<number>((ok) =>
      server.listen(port, "127.0.0.1", () =>
        ok((server.address() as AddressInfo).port),
      ),
    );
  const port = await listen(0);
  return {
    port,
    sockets,
    listen: () => listen(port),
    close: () =>
      new Promise<void>((ok) => {
        for (const s of sockets) s.destroy();
        server.close(() => ok());
      }),
  };
}

/** A relay to the real database: `close` cuts the worker off from it, `listen` brings it back on the same port. */
const relay = () =>
  listener((inbound) => {
    const [host, port] = DB_HOST.split(":");
    const outbound = connect(Number(port || 5432), host);
    outbound.on("error", () => inbound.destroy());
    inbound.on("close", () => outbound.destroy());
    inbound.pipe(outbound).pipe(inbound);
  });

const app = (
  db: Pick<pg.Pool, "query">,
  o: { release?: string; limitMs?: number } = {},
) =>
  opsRoutes({
    token: TOKEN,
    release: o.release,
    limitMs: o.limitMs,
    checks: { database: databaseReachable(db), "job queue": jobQueueReachable },
  });
const get = (a: ReturnType<typeof app>, path: string, token?: string) =>
  a.request(path, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

describe("GET /ready", () => {
  it("answers ready when the worker reaches its database and its job queue", async () => {
    const res = await get(app(pool), "/ready", TOKEN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("refuses a caller without the ready token, or with another", async () => {
    expect((await get(app(pool), "/ready")).status).toBe(401);
    expect((await get(app(pool), "/ready", "x".repeat(64))).status).toBe(401);
  });

  it("answers not ready, naming only the database, when nothing listens at its address", async () => {
    const closed = poolAt("127.0.0.1:1");
    try {
      const res = await get(app(closed), "/ready", TOKEN);
      expect(res.status).toBe(503);
      // the whole body: no error text, address or port reaches the caller
      expect(await res.text()).toBe('{"ok":false,"unreachable":["database"]}');
    } finally {
      await closed.end();
    }
  });

  it("gives up on a database that takes the connection and never answers, within its time limit", async () => {
    const hung = await listener(() => {});
    const db = poolAt(`127.0.0.1:${hung.port}`);
    try {
      const started = Date.now();
      const res = await get(app(db, { limitMs: 300 }), "/ready", TOKEN);
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        ok: false,
        unreachable: ["database"],
      });
    } finally {
      await hung.close();
      await db.end();
    }
  });

  it("answers not ready while the database is cut off, and ready again once it is back", async () => {
    const r = await relay();
    const db = poolAt(`127.0.0.1:${r.port}`);
    try {
      expect((await get(app(db), "/ready", TOKEN)).status).toBe(200);
      await r.close();
      const down = await get(app(db), "/ready", TOKEN);
      expect(down.status).toBe(503);
      expect(await down.json()).toEqual({
        ok: false,
        unreachable: ["database"],
      });
      await r.listen();
      const back = await get(app(db), "/ready", TOKEN);
      expect(back.status).toBe(200);
      expect(await back.json()).toEqual({ ok: true });
    } finally {
      await db.end();
      await r.close();
    }
  });

  it("answers not ready, naming the job queue, while the job runner is stopped, and ready again once it runs", async () => {
    await stopJobs();
    try {
      const res = await get(app(pool), "/ready", TOKEN);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        ok: false,
        unreachable: ["job queue"],
      });
    } finally {
      await startJobs(jobs.settings);
    }
    expect((await get(app(pool), "/ready", TOKEN)).status).toBe(200);
  }, 30_000);

  it("names both when the database and the job queue are both away", async () => {
    const closed = poolAt("127.0.0.1:1");
    await stopJobs();
    try {
      const res = await get(app(closed), "/ready", TOKEN);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        ok: false,
        unreachable: ["database", "job queue"],
      });
    } finally {
      await startJobs(jobs.settings);
      await closed.end();
    }
  }, 30_000);
});

describe("GET /release", () => {
  it("names the commit the build came from, and nothing else", async () => {
    const res = await get(app(pool, { release: COMMIT }), "/release", TOKEN);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`{"release":"${COMMIT}"}`);
  });

  it("says unknown when the build named no commit", async () => {
    const res = await get(app(pool), "/release", TOKEN);
    expect(await res.json()).toEqual({ release: "unknown" });
  });

  it("refuses a caller without the ready token", async () => {
    const res = await get(app(pool, { release: COMMIT }), "/release");
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(COMMIT);
  });

  it("env: RELEASE takes only a commit id, so the endpoint can show nothing else", () => {
    const base = {
      DATABASE_URL: "postgresql://x@127.0.0.1:54322/postgres",
      SUPABASE_URL: "http://localhost:54321",
    };
    expect(EnvSchema.parse(base).RELEASE).toBeUndefined();
    expect(EnvSchema.parse({ ...base, RELEASE: COMMIT }).RELEASE).toBe(COMMIT);
    expect(EnvSchema.parse({ ...base, RELEASE: "0123abc" }).RELEASE).toBe(
      "0123abc",
    );
    for (const bad of ["sk-live-abcdef", "0123ab", "main", `${COMMIT}0`])
      expect(EnvSchema.safeParse({ ...base, RELEASE: bad }).success).toBe(
        false,
      );
  });
});

describe("the worker's database pool", () => {
  // Unheard, an 'error' on a pg pool (an idle connection the database dropped: a restart, a network cut) ends the
  // process, so the worker would die instead of answering "not ready".
  it("outlives a connection the database drops", () => {
    expect(() => pool.emit("error", new Error("terminated"))).not.toThrow();
  });
});
