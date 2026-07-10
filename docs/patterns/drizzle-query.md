# Pattern: Drizzle query (org-scoped, typed, raw where clearer)
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
