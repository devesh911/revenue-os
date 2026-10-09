// One pool per process, connected as app_service (docs/security.md S1.2/S1.3). All queries via @revenue-os/db.
import { createPool } from "@revenue-os/db";
import { env } from "./env";
import { logger } from "./logger";

export const pool = createPool(env.DATABASE_URL);
// A connection the database drops while idle (a restart, a network cut) is an 'error' on the pool, and unheard it
// ends the process: the worker logs it, keeps running and answers "not ready" (src/ready.ts) until the database is back.
// One dropped while a unit of work holds it is heard by withOrg (packages/db/src/client.ts): that work fails instead.
pool.on("error", (err) => logger.warn({ err }, "database connection lost"));
