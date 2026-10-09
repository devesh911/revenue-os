// ONE process: Hono API + webhook receivers + pg-boss consumers + scheduler (docs/tech-stack.md, its API framework,
// jobs and hosting sections; the agent harness is its harness architecture section). The routes are in app.ts.
// Bun-specific code is allowed HERE (app entrypoint) — never in packages/* (AGENTS.md → Conventions).
import { app } from "./app";
import { env } from "./env";
import { startJobs } from "./jobs";
import { logger } from "./logger";

// pg-boss consumers boot with the server, never on test import (import.meta.main is
// false under bun test). Half-configured boot = refuse to run, same posture as env.ts.
if (import.meta.main) {
  startJobs().catch((err) => {
    logger.error({ err }, "pg-boss failed to start — worker refuses to boot");
    process.exit(1);
  });
}

export default { port: env.PORT, fetch: app.fetch };
