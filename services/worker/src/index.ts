// ONE process: Hono API + webhook receivers + pg-boss consumers + scheduler (tech-stack T5/T7/T8, harness T26)
// Bun-specific code is allowed HERE (app entrypoint) — never in packages/* (G1).
import { Hono } from "hono";
import { ZodError } from "zod";
import { type AuthEnv, requireAuth } from "./auth";
import { logger } from "./logger";
import { orgs } from "./routes/orgs";

const app = new Hono<AuthEnv>();

app.get("/health", (c) => c.json({ ok: true })); // S5.9: information-free
app.get("/ready", (c) =>
  c.json({ ok: true, todo: "db + pgboss checks (task 1)" }),
);

app.use("/orgs", requireAuth);
app.use("/orgs/*", requireAuth);
app.route("/", orgs);

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

// TODO task 7: mount packages/harness loop consumers; task 8: Vapi webhook (verify RAW-body signature -> webhook_events)
export default { port: 8080, fetch: app.fetch };
