// ONE process: Hono API + webhook receivers + pg-boss consumers + scheduler (docs/tech-stack.md, its API framework,
// jobs and hosting sections; the agent harness is its harness architecture section).
// Bun-specific code is allowed HERE (app entrypoint) — never in packages/* (AGENTS.md → Conventions).
import { Hono } from "hono";
import { cors } from "hono/cors";
import { type AuthEnv, requireAuth } from "./auth";
import { pool } from "./db";
import { env } from "./env";
import { onError } from "./errors";
import { jobQueueReachable, startJobs } from "./jobs";
import { logger } from "./logger";
import { databaseReachable, opsRoutes } from "./ready";
import { agents } from "./routes/agents";
import { contacts } from "./routes/contacts";
import { conversations } from "./routes/conversations";
import { guardrailPolicies } from "./routes/guardrail-policies";
import { orgs } from "./routes/orgs";
import { screens } from "./routes/screens";
import { vapiWebhook } from "./vapi/receive";

const app = new Hono<AuthEnv>();

// CORS before EVERYTHING: browser preflights (OPTIONS) carry no Authorization, so this
// must answer them before requireAuth. Explicit origin allowlist, never "*" (docs/security.md
// S3/S4).
app.use(
  "*",
  cors({
    origin: (origin) => (env.CORS_ORIGINS.includes(origin) ? origin : null),
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);

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

app.use("/orgs", requireAuth);
app.use("/orgs/*", requireAuth);
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

// pg-boss consumers boot with the server, never on test import (import.meta.main is
// false under bun test). Half-configured boot = refuse to run, same posture as env.ts.
if (import.meta.main) {
  startJobs().catch((err) => {
    logger.error({ err }, "pg-boss failed to start — worker refuses to boot");
    process.exit(1);
  });
}

export default { port: env.PORT, fetch: app.fetch };
