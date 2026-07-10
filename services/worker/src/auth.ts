// S1.5 — jose JWT verification: signature via GoTrue's JWKS (ES256/RS256 pinned — `none` and
// HS-downgrade rejected by construction), iss, aud, exp, clock skew ≤ 60s.
// jose caches the remote JWK set and refetches on unknown kid (key rotation safe).
import type { MiddlewareHandler } from "hono";
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
