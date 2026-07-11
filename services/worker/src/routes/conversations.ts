// Conversation transcript route — docs/patterns/hono-route.md shape: validate → authorize → do.
import { conversationMessages, memberRole } from "@revenue-os/db";
import { ConversationIdSchema, OrgIdSchema } from "@revenue-os/shared";
import { Hono } from "hono";
import type { AuthEnv } from "../auth";
import { pool } from "../db";

export const conversations = new Hono<AuthEnv>().get(
  "/orgs/:orgId/conversations/:conversationId/messages",
  async (c) => {
    const orgId = OrgIdSchema.parse(c.req.param("orgId")); // S5.1 — before ANY logic
    const conversationId = ConversationIdSchema.parse(
      c.req.param("conversationId"),
    );
    const actor = c.get("actor");
    const role = await memberRole(pool, orgId, actor.userId); // any role may read
    if (role === null) return c.json({ error: "forbidden" }, 403);
    const messages = await conversationMessages(pool, orgId, conversationId);
    if (messages === null) return c.json({ error: "not_found" }, 404);
    return c.json({ messages }); // S5.8 — no internals
  },
);
