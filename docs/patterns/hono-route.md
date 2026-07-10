# Pattern: Hono route (validate -> authorize -> do -> audit)
```ts
import { Hono } from "hono";
import { z } from "zod";
import { withOrg } from "@db/client";          // opens tx + set_config('request.org_id')
import { audit } from "@db/audit";

const Body = z.object({ contactId: z.string().uuid(), note: z.string().max(2000) }).strict();

export const contacts = new Hono().post("/contacts/:id/note", async (c) => {
  const body = Body.parse(await c.req.json());          // S5.1 — before ANY logic
  const org = c.get("org");                              // set by auth middleware (jose-verified JWT)
  const row = await withOrg(org.id, (db) => db.insertNote(body));
  await audit(org.id, { actor: c.get("actor"), action: "contact.note", resource: body.contactId });
  return c.json({ id: row.id });                         // S5.8: no internals in responses
});
```
Rules: Zod first · withOrg only · audit side effects · errors -> Sentry, client gets an id.
