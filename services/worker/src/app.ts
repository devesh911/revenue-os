// The worker's HTTP API: every route it serves, behind sign-in on each one but the short public list (auth.ts,
// PUBLIC_ROUTES). index.ts serves it and boots the job runner.
import { Hono } from "hono";
import { cors } from "hono/cors";
import { type AuthEnv, requireAuthUnlessPublic } from "./auth";
import { pool } from "./db";
import { env } from "./env";
import { onError } from "./errors";
import { jobQueueReachable } from "./jobs";
import { databaseReachable, opsRoutes } from "./ready";
import { agents } from "./routes/agents";
import { contacts } from "./routes/contacts";
import { conversations } from "./routes/conversations";
import { guardrailPolicies } from "./routes/guardrail-policies";
import { orgs } from "./routes/orgs";
import { screens } from "./routes/screens";
import { vapiWebhook } from "./vapi/receive";

export const app = new Hono<AuthEnv>();

// CORS before EVERYTHING: browser preflights (OPTIONS) carry no Authorization, so this
// must answer them before sign-in. Explicit origin allowlist, never "*" (docs/security.md
// S3/S4).
app.use(
  "*",
  cors({
    origin: (origin) => (env.CORS_ORIGINS.includes(origin) ? origin : null),
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);

// Then sign-in, on every path: a route off the public list, or no route at all, refuses a caller without it.
app.use("*", requireAuthUnlessPublic);

app.get("/health", (c) => c.json({ ok: true })); // information-free (docs/security.md S5.9)
// /ready and /release, behind their own token: the container's health check and the deploy ask them (src/ready.ts).
app.route(
  "/",
  opsRoutes({
    token: env.READY_TOKEN,
    release: env.RELEASE,
    checks: {
      database: databaseReachable(pool),
      "job queue": jobQueueReachable,
    },
  }),
);

app.route("/", orgs);
app.route("/", agents);
app.route("/", contacts);
app.route("/", conversations);
app.route("/", screens);
app.route("/", guardrailPolicies);
// Vapi's calls: one secret shared by every company, compared in constant time with the x-vapi-secret header
// (src/vapi/receive.ts); it is not a signature of the body.
app.route("/", vapiWebhook);

app.onError(onError); // clean statuses, never internals (src/errors.ts)
