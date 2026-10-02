// A pg-boss schema of a test's own, for a test that starts the worker's real job runner (startJobs in
// services/worker/src/jobs.ts). Its runner then works only the jobs queued in that schema: never another company's
// or another test run's queued calls in the shared `pgboss` schema, and, with no clock, it never ticks every
// company's due runs. Dropping the schema removes every queue and job the test made.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

/** `db` writes as the local superuser. The schema is made as migration 015 makes `pgboss`, so app_service can install pg-boss in it. */
export async function testJobSchema(db: Pick<Pool, "query">) {
  // Schemas of runs that were killed before they dropped theirs: named with their start time, gone after an hour.
  await db.query(`
    do $$ declare s text; begin
      for s in select nspname from pg_namespace
                where nspname ~ '^pgboss_test_[0-9]+_[0-9a-f]+$'
                  and split_part(nspname, '_', 3)::bigint < extract(epoch from now()) - 3600
      loop execute format('drop schema if exists %I cascade', s); end loop;
    end $$`);
  // Generated here, never input: a start time and a random part, within pg-boss's 50-character limit.
  const random = randomUUID().replaceAll("-", "").slice(0, 16);
  const schema = `pgboss_test_${Math.floor(Date.now() / 1000)}_${random}`;
  await db.query(`create schema ${schema}`);
  await db.query(`grant usage, create on schema ${schema} to app_service`);
  return {
    /** What the test passes to startJobs. */
    settings: { schema, schedule: false },
    drop: async () => {
      await db.query(`drop schema if exists ${schema} cascade`);
    },
  };
}
