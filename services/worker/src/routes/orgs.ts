// Org bootstrap routes — docs/patterns/hono-route.md shape: validate → authorize → do → audit.
import {
  addMember,
  createOrgWithAdmin,
  memberRole,
  updateOrg,
  userOrgs,
} from "@revenue-os/db";
import {
  AddMemberSchema,
  CreateOrgSchema,
  OrgIdSchema,
  UpdateOrgSchema,
} from "@revenue-os/shared";
import { Hono } from "hono";
import type { AuthEnv } from "../auth";
import { pool } from "../db";

export const orgs = new Hono<AuthEnv>()
  .post("/orgs", async (c) => {
    const body = CreateOrgSchema.parse(await c.req.json()); // S5.1 — before ANY logic
    const actor = c.get("actor");
    const org = await createOrgWithAdmin(pool, {
      ...body,
      userId: actor.userId,
    });
    return c.json({ id: org.id, role: "admin" }, 201); // S5.8 — no internals
  })
  .get("/orgs", async (c) => {
    const actor = c.get("actor");
    return c.json(await userOrgs(pool, actor.userId));
  })
  .patch("/orgs/:orgId", async (c) => {
    const orgId = OrgIdSchema.parse(c.req.param("orgId"));
    const body = UpdateOrgSchema.parse(await c.req.json());
    const actor = c.get("actor");
    const callerRole = await memberRole(pool, orgId, actor.userId); // S1.7 — admin gate
    if (callerRole !== "admin") return c.json({ error: "forbidden" }, 403);
    const updated = await updateOrg(pool, orgId, body, actor.userId);
    return c.json({ id: orgId, name: updated.name });
  })
  .post("/orgs/:orgId/members", async (c) => {
    const orgId = OrgIdSchema.parse(c.req.param("orgId"));
    const body = AddMemberSchema.parse(await c.req.json());
    const actor = c.get("actor");
    const callerRole = await memberRole(pool, orgId, actor.userId); // S1.7 — admin gate
    if (callerRole !== "admin") return c.json({ error: "forbidden" }, 403);
    await addMember(pool, orgId, body);
    return c.json({ ok: true }, 201);
  });
