// ONE process: Hono API + webhook receivers + pg-boss consumers + scheduler (tech-stack T5/T7/T8, harness T26)
// Bun-specific code is allowed HERE (app entrypoint) — never in packages/* (G1).
import { Hono } from "hono";

const app = new Hono();
app.get("/health", (c) => c.json({ ok: true })); // S5.9: information-free
app.get("/ready", (c) =>
  c.json({ ok: true, todo: "db + pgboss checks (task 1)" }),
);
// TODO task 7: mount packages/harness loop consumers; task 8: Vapi webhook (verify RAW-body signature -> webhook_events)
export default { port: 8080, fetch: app.fetch };
