// The one way a test makes companies (orgs): each under a random name and slug, and a clean-up that deletes only
// what it made. So a test run never deletes data it did not create: not another test's, not another run's started
// at the same moment on this shared database, and never the dev login's workspace (scripts/dev-login.ts), whose
// slug no company made here can have.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

type Db = Pick<Pool, "query">;

/**
 * `db` writes as the local superuser (`postgres`, which row-level security lets through). A test whose companies
 * queue pg-boss jobs also passes `jobs`: a connection that owns pg-boss's tables (app_service), so clean-up
 * removes those companies' queued jobs and no one else's.
 */
export function testCompanies(db: Db, jobs?: Db) {
  const made: string[] = [];
  return {
    /** Makes a company named `<name> <random>` under a random slug, directly or through `make` (such as the product's own route). */
    async add(
      name = "Test company",
      make?: (name: string, slug: string) => Promise<string>,
    ): Promise<{ id: string; slug: string }> {
      const tag = randomUUID();
      const [full, slug] = [`${name} ${tag.slice(0, 8)}`, `test-${tag}`];
      const id = make
        ? await make(full, slug)
        : (
            await db.query<{ id: string }>(
              `insert into orgs (name, slug) values ($1, $2) returning id`,
              [full, slug],
            )
          ).rows[0]?.id;
      const mine =
        id &&
        (
          await db.query(`select 1 from orgs where id = $1 and slug = $2`, [
            id,
            slug,
          ])
        ).rowCount;
      if (!id || !mine)
        throw new Error(`company ${id} was not made under slug ${slug}`);
      made.push(id);
      return { id, slug };
    },
    /** Deletes every company `add` made: first its rows that don't cascade and its queued jobs, then the company with the rest. */
    async cleanup(): Promise<void> {
      const ids = made.splice(0);
      if (!ids.length) return;
      for (const table of ["audit_log", "usage_events", "eval_runs"])
        await db.query(`delete from ${table} where org_id = any($1::uuid[])`, [
          ids,
        ]);
      await jobs?.query(
        `delete from pgboss.job where data ->> 'orgId' = any($1::text[])`,
        [ids],
      );
      await db.query(`delete from orgs where id = any($1::uuid[])`, [ids]);
    },
  };
}
