// The worker's own error handler (services/worker/src/errors.ts), in front of its readiness routes as index.ts mounts
// it: a refusal Hono's middleware throws keeps its status.
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { pool } from "../src/db";
import { onError } from "../src/errors";
import { databaseReachable, opsRoutes } from "../src/ready";

const TOKEN = "r".repeat(64);
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const get = (a: Hono, path: string, token?: string) =>
  a.request(path, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

// Repro (2026-10-06, Slice 1's readiness proof step on a real worker with READY_TOKEN set): /ready without the token
// answered 500. Hono's bearerAuth refuses by throwing a 401 HTTPException, and the worker's error handler turned every
// error it did not know into 500; tests never saw it, as with no token configured the refusal is returned, not thrown.
describe("behind the worker's own error handler", () => {
  const worker = (release?: string) =>
    new Hono().onError(onError).route(
      "/",
      opsRoutes({
        token: TOKEN,
        release,
        checks: { database: databaseReachable(pool) },
      }),
    );

  it("a missing or wrong ready token is refused with 401, not 500", async () => {
    for (const path of ["/ready", "/release"]) {
      expect((await get(worker(COMMIT), path)).status).toBe(401);
      const wrong = await get(worker(COMMIT), path, "x".repeat(64));
      expect(wrong.status).toBe(401);
      expect(await wrong.text()).not.toContain(COMMIT);
    }
    expect((await get(worker(), "/ready", TOKEN)).status).toBe(200);
  });

  // A request body that isn't JSON is turned into a 400 where it is read (src/json-body.ts), never here: a
  // SyntaxError from the server's own code is a fault.
  // behaviour already on main: the handler maps only ZodError to 400; this keeps a bad-body fix from widening it
  it("a SyntaxError the route's own code throws is 500 internal, not 400", async () => {
    const route = new Hono().onError(onError).get("/", (c) => {
      JSON.parse("{oops");
      return c.json({});
    });
    const res = await route.request("/");
    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 500,
      body: { error: "internal" },
    });
  });
});
