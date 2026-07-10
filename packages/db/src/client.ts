// The ONLY sanctioned DB entry (db-design §1, S1.3): every unit of work runs inside a
// transaction that sets request.org_id, connected as the RLS-bound app_service role.
// Raw pool access outside withOrg is a review-blocking smell.
// G1: runtime-agnostic — no bun:* imports, no Bun globals.
import { OrgIdSchema } from "@revenue-os/shared";
import pg from "pg";

export type { PoolClient } from "pg";

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}

/**
 * Run `fn` inside a transaction scoped to `orgId` via set_config('request.org_id', …, true).
 * The third argument `true` makes the setting transaction-local: nothing leaks back to the
 * pooled connection (proven by test).
 */
export async function withOrg<T>(
  pool: pg.Pool,
  orgId: string,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const org = OrgIdSchema.parse(orgId);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.org_id', $1, true)", [org]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      // connection-level failure: release() below discards the client
    }
    throw err;
  } finally {
    client.release();
  }
}
