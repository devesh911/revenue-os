// The pg-boss schema a test's job runner gets (fixtures/test-job-schema.ts): pg-boss installs into it as
// app_service, dropping it removes it, and a schema a killed run left behind is swept once it is an hour old,
// never sooner.
import { afterAll, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { testJobSchema } from "./fixtures/test-job-schema";

const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});
const exists = async (schema: string) =>
  (await admin.query(`select 1 from pg_namespace where nspname = $1`, [schema]))
    .rowCount === 1;

afterAll(async () => {
  await admin.end();
});

it("pg-boss installs into it as app_service, and dropping it removes it", async () => {
  const jobs = await testJobSchema(admin);
  const boss = new PgBoss({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres",
    createSchema: false,
    ...jobs.settings,
  });
  await boss.start();
  await boss.createQueue("place_call");
  await boss.send("place_call", { orgId: "x" });
  await boss.stop({ graceful: true, timeout: 5_000 });
  const { schema } = jobs.settings;
  expect(
    (await admin.query(`select name from ${schema}.job`)).rows.map(
      (r) => r.name,
    ),
  ).toEqual(["place_call"]);
  await jobs.drop();
  expect(await exists(schema)).toBe(false);
}, 30_000);

it("sweeps a schema a killed run left an hour ago, but not one still in use", async () => {
  const hourAgo = Math.floor(Date.now() / 1000) - 3700;
  const left = `pgboss_test_${hourAgo}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await admin.query(`create schema ${left}`);
  const current = await testJobSchema(admin);
  const next = await testJobSchema(admin);
  expect(await exists(left)).toBe(false);
  expect(await exists(current.settings.schema)).toBe(true);
  await current.drop();
  await next.drop();
});
