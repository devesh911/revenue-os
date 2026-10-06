// The worker's release endpoint (GET /release) and the ready token in front of both its routes
// (services/worker/src/ready.ts), with the real database as the one check.
import { describe, expect, it } from "bun:test";
import { pool } from "../src/db";
import { databaseReachable, opsRoutes } from "../src/ready";

const TOKEN = "r".repeat(64);
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const app = (o: { release?: string } = {}) =>
  opsRoutes({
    token: TOKEN,
    release: o.release,
    checks: { database: databaseReachable(pool) },
  });
const get = (a: ReturnType<typeof app>, path: string, token?: string) =>
  a.request(path, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

describe("the ready token", () => {
  it("refuses a caller without the ready token, or with another", async () => {
    expect((await get(app(), "/ready")).status).toBe(401);
    expect((await get(app(), "/ready", "x".repeat(64))).status).toBe(401);
  });
});

describe("GET /release", () => {
  it("names the commit the build came from, and nothing else", async () => {
    const res = await get(app({ release: COMMIT }), "/release", TOKEN);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`{"release":"${COMMIT}"}`);
  });

  it("says unknown when the build named no commit", async () => {
    const res = await get(app(), "/release", TOKEN);
    expect(await res.json()).toEqual({ release: "unknown" });
  });

  it("refuses a caller without the ready token", async () => {
    const res = await get(app({ release: COMMIT }), "/release");
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(COMMIT);
  });
});
