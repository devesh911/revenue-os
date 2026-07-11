// ONE process: Hono API + webhook receivers + pg-boss consumers + scheduler (tech-stack T5/T7/T8, harness T26)
// Bun-specific code is allowed HERE (app entrypoint) — never in packages/* (G1).
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { type AuthEnv, requireAuth } from "./auth";
import { env } from "./env";
import { startJobs } from "./jobs";
import { logger } from "./logger";
import { contacts } from "./routes/contacts";
import { conversations } from "./routes/conversations";
import { orgs } from "./routes/orgs";
import { vapiWebhook } from "./vapi/receive";

const app = new Hono<AuthEnv>();

// CORS before EVERYTHING: browser preflights (OPTIONS) carry no Authorization, so this
// must answer them before requireAuth. Explicit origin allowlist (S3/S4) — never "*".
app.use(
  "*",
  cors({
    origin: (origin) => (env.CORS_ORIGINS.includes(origin) ? origin : null),
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.get("/health", (c) => c.json({ ok: true })); // S5.9: information-free
app.get("/ready", (c) =>
  c.json({ ok: true, todo: "db + pgboss checks (task 1)" }),
);

app.use("/orgs", requireAuth);
app.use("/orgs/*", requireAuth);
app.route("/", orgs);
app.route("/", contacts);
app.route("/", conversations);
app.route("/", vapiWebhook); // authn = per-assistant shared secret on the raw body (S6.2)

// S5.8: clients get clean statuses, never internals; detail goes to the log.
app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: "invalid_request" }, 400);
  if (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  ) {
    return c.json({ error: "conflict" }, 409);
  }
  logger.error({ err }, "unhandled route error");
  return c.json({ error: "internal" }, 500);
});

// TODO task 7: mount packages/harness loop consumers
// pg-boss consumers boot with the server, never on test import (import.meta.main is
// false under bun test). Half-configured boot = refuse to run, same posture as env.ts.
if (import.meta.main) {
  startJobs().catch((err) => {
    logger.error({ err }, "pg-boss failed to start — worker refuses to boot");
    process.exit(1);
  });
}

export default { port: 8080, fetch: app.fetch };
