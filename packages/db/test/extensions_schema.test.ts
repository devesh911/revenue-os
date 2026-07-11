// Migration 014 — vector + pg_trgm move out of `public` into `extensions` (Supabase advisors
// extension_in_public; decided in STATE.md while no cloud project exists, so the move is one
// ALTER instead of a live-database surgery). Existing indexes/columns bind by OID and are
// unaffected; the runtime role keeps unqualified access via its search_path.
import { afterAll, describe, expect, it } from "bun:test";
import { Pool } from "pg";

const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const APP_SERVICE_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";

const admin = new Pool({ connectionString: LOCAL_DB_URL, max: 1 });
const appService = new Pool({ connectionString: APP_SERVICE_URL, max: 1 });

afterAll(async () => {
  await admin.end();
  await appService.end();
});

describe("extensions live in the extensions schema (advisors: extension_in_public)", () => {
  it("vector and pg_trgm are installed in `extensions`, not `public`", async () => {
    const r = await admin.query(
      `select extname, nspname
         from pg_extension e join pg_namespace n on n.oid = e.extnamespace
        where extname in ('vector', 'pg_trgm')
        order by extname`,
    );
    expect(r.rows).toEqual([
      { extname: "pg_trgm", nspname: "extensions" },
      { extname: "vector", nspname: "extensions" },
    ]);
  });

  it("app_service still reaches trgm + vector unqualified (search_path carries the move)", async () => {
    // similarity() and the vector type must keep working for the runtime role without
    // schema-qualification — existing query code never qualifies.
    const sim = await appService.query(
      `select similarity('revenue', 'revenues') > 0 as ok`,
    );
    expect(sim.rows[0].ok).toBe(true);

    const vec = await appService.query(`select '[1,2,3]'::vector as v`);
    expect(vec.rows[0].v).toBe("[1,2,3]");
  });

  it("the pre-existing trgm index and vector columns survived the move (bind by OID)", async () => {
    const idx = await admin.query(
      `select indexdef from pg_indexes where indexname = 'companies_name_trgm'`,
    );
    expect(idx.rows.length).toBe(1);
    const cols = await admin.query(
      `select count(*)::int as n from information_schema.columns
        where udt_name = 'vector' and table_schema = 'public'`,
    );
    expect(cols.rows[0].n).toBe(2); // memories.embedding + knowledge_chunks.embedding
  });
});
