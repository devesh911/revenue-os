// One pool per process, connected as app_service (S1.2/S1.3). All queries via @revenue-os/db.
import { createPool } from "@revenue-os/db";
import { env } from "./env";

export const pool = createPool(env.DATABASE_URL);
