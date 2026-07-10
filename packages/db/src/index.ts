// app_service client (sets request.org_id per tx) + drizzle schema mirror — the ONLY DB entry
// G1: runtime-agnostic — no bun:* imports, no Bun globals in this package.
export { createPool, withOrg, type PoolClient } from "./client";
export * as schema from "./schema";
