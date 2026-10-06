// Sign-in on every route but a short public list (src/auth.ts, PUBLIC_ROUTES), through the worker's real routes
// (src/app.ts, served by src/index.ts): every route it mounts is asked without a sign-in token, so a new route is
// covered as soon as it is mounted. What a token must be to pass (signature, expiry, issuer, audience, user) is
// checked with keys of this test's own, since the local sign-in server's private key never leaves it. The new code is
// loaded inside each test, so on main's code, which lacks it, each test fails on its own instead of the file failing
// to load.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
  UnsecuredJWT,
} from "jose";
import pg from "pg";
import { testUser } from "../../../tests/test-users";
import type { AuthEnv } from "../src/auth";
import worker from "../src/index";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 1,
});
afterAll(() => admin.end());

const auth = () => import("../src/auth");

/** Every route the worker mounts, as "METHOD /path", its sign-in middleware left out. */
async function mounted() {
  const { app } = await import("../src/app");
  return [
    ...new Set(
      app.routes
        .filter((r) => r.method !== "ALL")
        .map((r) => `${r.method} ${r.path}`),
    ),
  ];
}

/** Asks the worker's real routes `method path`, each `:param` filled with a random id. */
const ask = (route: string, token?: string) => {
  const [method = "GET", path = "/"] = route.split(" ");
  return worker.fetch(
    new Request(
      `http://localhost${path.replace(/:[^/]+/g, () => randomUUID())}`,
      {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: method === "GET" ? undefined : "{}",
      },
    ),
  );
};

describe("every route requires sign-in unless it is on the public list", () => {
  it("lists only routes the worker really serves, and they are few", async () => {
    const [routes, { PUBLIC_ROUTES }] = await Promise.all([mounted(), auth()]);
    expect([...PUBLIC_ROUTES].sort()).toEqual([
      "GET /health",
      "GET /ready",
      "GET /release",
      "POST /webhooks/vapi/:orgId",
    ]);
    expect(routes.filter((r) => PUBLIC_ROUTES.has(r)).sort()).toEqual(
      [...PUBLIC_ROUTES].sort(),
    );
    expect(PUBLIC_ROUTES.size).toBeLessThan(routes.length / 2);
  });

  it("refuses a caller with no sign-in token on every other route, before the route runs", async () => {
    const [routes, { PUBLIC_ROUTES }] = await Promise.all([mounted(), auth()]);
    const signedInRoutes = routes.filter((r) => !PUBLIC_ROUTES.has(r));
    expect(signedInRoutes.length).toBeGreaterThan(10);
    for (const route of signedInRoutes) {
      const res = await ask(route);
      expect({ route, status: res.status }).toEqual({ route, status: 401 });
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("refuses a path no route serves to a caller without sign-in, and says 404 only to one signed in", async () => {
    expect((await ask("GET /no-such-route")).status).toBe(401);
    expect((await ask("POST /orgs-but-not-quite")).status).toBe(401);
    const { token } = await testUser(admin, "no-route");
    expect((await ask("GET /no-such-route", token)).status).toBe(404);
  });

  // behaviour already on main: /health has always answered without sign-in; this keeps it so
  it("answers /health without sign-in", async () => {
    const res = await ask("GET /health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  // /ready, /release and Vapi's webhook answer 401 from their own checks without their token or secret, so through
  // the real app a refusal can't tell whose it was: here each public route is reached with no sign-in at all.
  it("lets a request reach each public route without sign-in, and no other", async () => {
    const { PUBLIC_ROUTES, requireAuthUnlessPublic } = await auth();
    const reached: string[] = [];
    const probe = new Hono<AuthEnv>().use("*", requireAuthUnlessPublic);
    for (const route of [...PUBLIC_ROUTES, "GET /orgs", "POST /orgs"]) {
      const [method = "GET", path = "/"] = route.split(" ");
      probe.on(method, path, (c) => {
        reached.push(route);
        return c.text("reached");
      });
    }
    for (const route of [...PUBLIC_ROUTES]) {
      const [method = "GET", path = "/"] = route.split(" ");
      const res = await probe.request(path.replace(":orgId", randomUUID()), {
        method,
      });
      expect({ route, status: res.status }).toEqual({ route, status: 200 });
    }
    expect((await probe.request("/orgs")).status).toBe(401);
    expect((await probe.request("/orgs", { method: "POST" })).status).toBe(401);
    expect(reached.sort()).toEqual([...PUBLIC_ROUTES].sort());
  });
});

describe("a sign-in token the worker accepts", () => {
  it("accepts the real sign-in server's token, and refuses one signed with another key in its name", async () => {
    const user = await testUser(admin, "real-token");
    const ok = await ask("GET /orgs", user.token);
    expect(ok.status).toBe(200);
    // The same claims and the same key id, signed with a key of our own: the published key doesn't match.
    const [head = "", body = ""] = user.token.split(".");
    const { kid } = JSON.parse(Buffer.from(head, "base64url").toString());
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    const { privateKey } = await generateKeyPair("ES256");
    const forged = await new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid })
      .sign(privateKey);
    expect((await ask("GET /orgs", forged)).status).toBe(401);
  });

  describe("with keys of the test's own", () => {
    let sign: (
      claims: JWTPayload,
      opts?: { exp?: number | string | null },
    ) => Promise<string>;
    let otherKey: CryptoKey;
    let keys: Parameters<typeof createLocalJWKSet>[0];

    beforeAll(async () => {
      const mine = await generateKeyPair("ES256", { extractable: true });
      otherKey = (await generateKeyPair("ES256")).privateKey;
      keys = { keys: [{ ...(await exportJWK(mine.publicKey)), kid: "mine" }] };
      sign = (claims, { exp = "1h" } = {}) => {
        const jwt = new SignJWT(claims)
          .setProtectedHeader({ alg: "ES256", kid: "mine" })
          .setIssuedAt();
        return (exp === null ? jwt : jwt.setExpirationTime(exp)).sign(
          mine.privateKey,
        );
      };
    });

    /** A route behind the worker's token check, trusting this test's keys from the local sign-in server's address. */
    const probe = async () => {
      const { signedIn } = await auth();
      return new Hono<AuthEnv>()
        .use("*", signedIn(createLocalJWKSet(keys), SUPABASE_URL))
        .get("/me", (c) => c.json(c.get("actor")));
    };
    const me = async (token: string) =>
      (await probe()).request("/me", {
        headers: { authorization: `Bearer ${token}` },
      });
    const good = {
      sub: "6f1f4d0e-0000-4000-8000-000000000001",
      aud: "authenticated",
      iss: `${SUPABASE_URL}/auth/v1`,
    };

    it("names the user of a good token", async () => {
      const res = await me(await sign(good));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ userId: good.sub });
    });

    it("refuses an expired token, past the minute of clock skew it allows", async () => {
      const now = Math.floor(Date.now() / 1000);
      expect((await me(await sign(good, { exp: now - 120 }))).status).toBe(401);
      expect((await me(await sign(good, { exp: now - 30 }))).status).toBe(200);
    });

    it("refuses a token with no expiry or no user", async () => {
      expect((await me(await sign(good, { exp: null }))).status).toBe(401);
      expect(
        (await me(await sign({ aud: good.aud, iss: good.iss }))).status,
      ).toBe(401);
      expect((await me(await sign({ ...good, sub: "" }))).status).toBe(401);
    });

    it("refuses a token for another audience or from another issuer", async () => {
      expect((await me(await sign({ ...good, aud: "anon" }))).status).toBe(401);
      expect(
        (await me(await sign({ ...good, iss: "https://elsewhere.invalid" })))
          .status,
      ).toBe(401);
    });

    it("refuses a token signed with another key, with a shared secret, or not at all", async () => {
      const otherSigned = await new SignJWT(good)
        .setProtectedHeader({ alg: "ES256", kid: "mine" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(otherKey);
      const hs256 = await new SignJWT(good)
        .setProtectedHeader({ alg: "HS256", kid: "mine" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode("a-shared-secret-of-32-bytes-long!"));
      const unsigned = new UnsecuredJWT(good)
        .setIssuedAt()
        .setExpirationTime("1h")
        .encode();
      for (const token of [otherSigned, hs256, unsigned, "not.a.jwt"])
        expect((await me(token)).status).toBe(401);
    });

    it("refuses a header that is not a bearer token", async () => {
      const [token, route] = await Promise.all([sign(good), probe()]);
      for (const authorization of [token, `Basic ${token}`, `bearer ${token}`])
        expect(
          (await route.request("/me", { headers: { authorization } })).status,
        ).toBe(401);
      expect((await route.request("/me")).status).toBe(401);
    });
  });
});
