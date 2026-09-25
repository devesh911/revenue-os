// S1.5 — jose JWT verification: signature via GoTrue's JWKS (ES256/RS256 pinned — `none` and
// HS-downgrade rejected by construction), iss, aud, exp, clock skew ≤ 60s.
// jose caches the remote JWK set and refetches on unknown kid (key rotation safe).
import type { MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "./env";

export interface Actor {
  userId: string;
}

export type AuthEnv = { Variables: { actor: Actor } };

const jwks = createRemoteJWKSet(
  new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer "))
    return c.json({ error: "unauthorized" }, 401);
  try {
    const { payload } = await jwtVerify(header.slice(7), jwks, {
      algorithms: ["ES256", "RS256"],
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
      clockTolerance: 60,
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return c.json({ error: "unauthorized" }, 401);
    }
    c.set("actor", { userId: payload.sub });
    await next();
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }
};

// S5.9: /ready carries its OWN token. X-Edge-Auth cannot gate it — Cloudflare's Transform Rule
// stamps that header on EVERY forwarded request, strangers' included. No token = fail closed.
// bearerAuth compares in constant time.
export const requireReadyToken = (
  token: string | undefined,
): MiddlewareHandler =>
  token
    ? bearerAuth({ token })
    : async (c) => c.json({ error: "unauthorized" }, 401);
