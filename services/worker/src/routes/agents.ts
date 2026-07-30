// Console agents read path (task 50, spec §12) — docs/patterns/hono-route.md shape:
// validate → authorize → do. One org-scoped read endpoint backing the console AgentsPage.
import { listAgentsAndWorkflows, memberRole } from "@revenue-os/db";
import { OrgIdSchema } from "@revenue-os/shared";
import { Hono } from "hono";
import type { AuthEnv } from "../auth";
import { pool } from "../db";

export const agents = new Hono<AuthEnv>().get(
  "/orgs/:orgId/agents",
  async (c) => {
    const orgId = OrgIdSchema.parse(c.req.param("orgId")); // S5.1 — before ANY logic
    const actor = c.get("actor");
    const role = await memberRole(pool, orgId, actor.userId);
    if (role === null) return c.json({ error: "forbidden" }, 403);
    // db returns exactly { agents, workflows } with lean columns — ship as-is, no internals (S5.8).
    return c.json(await listAgentsAndWorkflows(pool, orgId));
  },
);
