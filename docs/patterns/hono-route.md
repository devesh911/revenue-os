# Pattern: Hono route (signed in → validate → authorize → do → audit) — no example yet

**Do not copy a route from this file's history, or from memory.** The example that stood here read the company
from a sign-in step that doesn't exist (`c.get("org")`), called `withOrg` and `audit` with arguments they don't
take and a database method nothing has (`db.insertNote`), wrote the audit row outside the change's transaction,
and checked no role. It is deleted. The route example comes back as an excerpt of real code with Slice 5 ·
"One shared membership and role check (admin, operator, viewer)…", which mounts one check for every company route.

What is true today, so you know what a route must still do by hand:
- Sign-in: done for you. `requireAuthUnlessPublic` (`services/worker/src/auth.ts`) runs on every path of the app in
  `services/worker/src/app.ts`, so a new route mounted there refuses a caller without a valid sign-in token, and
  `c.get("actor").userId` names the caller. Only the routes on `PUBLIC_ROUTES` in the same file skip it, each with a
  check of its own. `services/worker/test/sign-in.test.ts` asks every mounted route without a token and pins the
  public list word for word, so adding to it means changing that test too, with a check and a test of the new
  route's own.
- Role: each route asks `memberRole` (`packages/db/src/orgs.ts`) itself and refuses a non-member, or a role too low
  for a change, with 403. The company id comes from the web address and is trusted only after that check; a route
  that forgets it serves any company's data, which is why the shared check comes first.
- Database work goes through `withOrg(pool, orgId, (tx) => …)` (`packages/db/src/client.ts`), and an audit row is
  written with `audit(tx, orgId, entry)` (`packages/db/src/audit.ts`) inside the same transaction as the change.
- Errors: `onError` (`services/worker/src/errors.ts`, mounted in `services/worker/src/app.ts`) answers a Zod failure
  with 400, a unique-constraint violation with 409 and anything unexpected with 500, logging the detail and sending
  the client none of it.

Rules: signed in before anything · request input parsed with its schema from packages/shared before any logic ·
the member's role checked before any read or write, the company id in the web address never trusted alone ·
database work only inside `withOrg` · the audit row in the same transaction as its change · no internals in a
response.
