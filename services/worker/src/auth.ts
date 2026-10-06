// Sign-in on every route but a short public list (docs/security.md S1.5). A sign-in token is checked with jose:
// its signature against the sign-in server's published keys (ES256/RS256 only, so `none` and a downgrade to a
// shared-secret HS256 token are refused), its issuer, its audience, and its expiry, with at most 60 s of clock skew;
// a token without an expiry or a user id is refused too. jose caches the published keys and fetches them again for
// a key id it does not know, so a key rotation needs no restart.
import type { MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { matchedRoutes } from "hono/route";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { env } from "./env";

export interface Actor {
  userId: string;
}

export type AuthEnv = { Variables: { actor: Actor } };

/**
 * Refuses with 401 a caller whose sign-in token the sign-in server at `server` didn't issue, signed with one of its
 * `keys`; names the user otherwise.
 */
export function signedIn(
  keys: JWTVerifyGetKey,
  server: string,
): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const header = c.req.header("authorization");
    const payload = header?.startsWith("Bearer ")
      ? await jwtVerify(header.slice(7), keys, {
          algorithms: ["ES256", "RS256"],
          issuer: `${server}/auth/v1`,
          audience: "authenticated",
          clockTolerance: 60,
          requiredClaims: ["exp", "sub"],
        }).then(
          (r) => r.payload,
          () => undefined,
        )
      : undefined;
    if (typeof payload?.sub !== "string" || payload.sub.length === 0)
      return c.json({ error: "unauthorized" }, 401);
    c.set("actor", { userId: payload.sub });
    await next();
  };
}

const requireAuth = signedIn(
  createRemoteJWKSet(
    new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
  ),
  env.SUPABASE_URL,
);

// The short public list: the only routes that answer without sign-in, each behind a check of its own. /health says
// nothing (docs/security.md S5.9); /ready and /release take the ready token (src/ready.ts); Vapi's webhook takes the
// shared secret in its header (src/vapi/receive.ts).
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  "GET /health",
  "GET /ready",
  "GET /release",
  "POST /webhooks/vapi/:orgId",
]);

/** Mounted on every path: sign-in first, unless the route the request reaches is on the public list. */
export const requireAuthUnlessPublic: MiddlewareHandler<AuthEnv> = (
  c,
  next,
) => {
  const route = matchedRoutes(c)
    .filter((r) => r.method !== "ALL")
    .pop();
  return route && PUBLIC_ROUTES.has(`${route.method} ${route.path}`)
    ? next()
    : requireAuth(c, next);
};

// /ready carries its OWN token (docs/security.md S5.9). X-Edge-Auth cannot gate it: Cloudflare's Transform Rule
// stamps that header on EVERY forwarded request, strangers' included. No token = fail closed.
// bearerAuth compares in constant time.
export const requireReadyToken = (
  token: string | undefined,
): MiddlewareHandler =>
  token
    ? bearerAuth({ token })
    : async (c) => c.json({ error: "unauthorized" }, 401);
