// Load supabase/seeds/<pack>.sql into the LOCAL stack. Refuses non-local URLs by design
// (docs/security.md S13.3 / S11.5 — staging seeding goes through CI, never this script pointed at
// prod).
// Seeds run as the migration owner (RLS-exempt bootstrap tooling); org context is passed to
// the pack via set_config('seed.org_id', …) inside one transaction.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import {
  DEV_LOGIN_EMAIL,
  DEV_LOGIN_PASSWORD,
  ensureDevLogin,
} from "./dev-login";
import { isLocalUrl } from "./local-url";

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
const localDbUrl = () =>
  process.env.LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Seeds `pack` into the workspace `slug` (default: the pack's own, which the dev login uses). */
export async function seed(
  pack: Pack,
  slug?: string,
): Promise<{ orgId: string }> {
  const meta = PACKS[pack];
  if (!meta)
    throw new Error(
      `unknown pack: ${pack} (expected ${Object.keys(PACKS).join(" | ")})`,
    );

  const url = localDbUrl();
  if (!isLocalUrl(url)) {
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
      [meta.name, slug ?? meta.slug, meta.vertical],
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

// `bun run db:seed <pack> [slug]`: into the pack's own workspace, or into the workspace `slug` (a test's own).
if (import.meta.main) {
  const [pack, slug] = process.argv.slice(2) as [Pack, string | undefined];
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    console.error(
      "SUPABASE_URL missing — run `bun run db:seed <pack>`, which fills it from the local stack",
    );
    process.exit(1);
  }
  const { orgId } = await seed(pack, slug);
  console.log(`seeded pack '${pack}' into org ${orgId}`);
  await ensureDevLogin({
    supabaseUrl,
    dbUrl: localDbUrl(),
    orgIds: [orgId],
  });
  console.log(
    `LOCAL-ONLY dev login, admin of '${PACKS[pack].name}': ${DEV_LOGIN_EMAIL} / ${DEV_LOGIN_PASSWORD}`,
  );
}
