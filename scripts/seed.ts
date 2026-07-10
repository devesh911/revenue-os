// Task 5: load supabase/seeds/<pack>.sql into the LOCAL stack. Refuses non-local URLs by
// design (S13.3 / S11.5 — staging seeding goes through CI, never this script pointed at prod).
// Seeds run as the migration owner (RLS-exempt bootstrap tooling); org context is passed to
// the pack via set_config('seed.org_id', …) inside one transaction.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const PACKS = {
  real_estate: {
    slug: "seed-real-estate",
    name: "Seed — Real Estate",
    vertical: "real_estate",
  },
  b2b_wholesale: {
    slug: "seed-b2b-wholesale",
    name: "Seed — B2B Wholesale (ceramics)",
    vertical: "b2b_wholesale",
  },
} as const;
export type Pack = keyof typeof PACKS;

export async function seed(pack: Pack): Promise<{ orgId: string }> {
  const meta = PACKS[pack];
  if (!meta)
    throw new Error(
      `unknown pack: ${pack} (expected ${Object.keys(PACKS).join(" | ")})`,
    );

  const url =
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error("db:seed refuses to run against a non-local database");
  }

  const sql = readFileSync(
    join(import.meta.dir, "../supabase/seeds", `${pack}.sql`),
    "utf8",
  );
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    const org = await client.query(
      `insert into orgs (name, slug, vertical) values ($1, $2, $3)
			 on conflict (slug) do update set name = excluded.name
			 returning id`,
      [meta.name, meta.slug, meta.vertical],
    );
    const orgId: string = org.rows[0].id;
    await client.query(`select set_config('seed.org_id', $1, true)`, [orgId]);
    await client.query(sql);
    await client.query("commit");
    return { orgId };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  const pack = process.argv[2] as Pack;
  const { orgId } = await seed(pack);
  console.log(`seeded pack '${pack}' into org ${orgId}`);
}
