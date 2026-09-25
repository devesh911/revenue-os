# Pattern: org-scoped SQL query (what the code actually does)
> The file name is historical: **Drizzle is installed but no query uses it.** Every query is parameterised SQL through `tx.query` inside `withOrg`. Adopting Drizzle for new code would be a recorded decision in `STATE.md`. The Drizzle example further down is kept only for that discussion.

```ts
// the real idiom (e.g. packages/db/src/audit.ts, packages/harness/src/tools/book-appointment.ts)
const rows = await withOrg(pool, orgId, (tx) =>
  tx.query(
    `select id, title from tasks where org_id = $1 and status = $2 order by priority desc limit 50`,
    [orgId, "open"],
  ),
);
```
Rules: org_id in EVERY where (RLS is the net, not the query plan) · values only through `$n` parameters, no string concatenation, ever.

## Historical Drizzle example (not used in this codebase)
```ts
// typed builder for the common shape
const hot = await db.select().from(tasks)
  .where(and(eq(tasks.orgId, orgId), eq(tasks.status, "open"), eq(tasks.kind, "callback")))
  .orderBy(desc(tasks.priority)).limit(50);

// sanctioned raw when SQL is clearer (still parameterized — S5.2)
const lift = await db.execute(sql`
  select count(*) filter (where o.occurred_at < now() - interval '14 day') as before
  from outcomes o where o.org_id = ${orgId} and o.kind = ${kind}`);
```
Rules: org_id in EVERY where (RLS is the net, not the query plan) · no string concatenation, ever.
