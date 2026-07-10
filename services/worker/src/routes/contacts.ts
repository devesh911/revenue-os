// Contact CSV import (ceramic path, D19) — validate → authorize → do → audit.
import { importContacts, memberRole } from "@revenue-os/db";
import { OrgIdSchema, parseCsv } from "@revenue-os/shared";
import { Hono } from "hono";
import type { AuthEnv } from "../auth";
import { pool } from "../db";

const MAX_CSV_BYTES = 10 * 1024 * 1024; // S5.7: CSV ≤ 10MB

export const contacts = new Hono<AuthEnv>().post(
  "/orgs/:orgId/contacts/import",
  async (c) => {
    const orgId = OrgIdSchema.parse(c.req.param("orgId"));
    const actor = c.get("actor");
    const role = await memberRole(pool, orgId, actor.userId); // S1.7 — mutations are operator+
    if (role !== "operator" && role !== "admin")
      return c.json({ error: "forbidden" }, 403);

    const raw = await c.req.text();
    if (raw.length > MAX_CSV_BYTES) return c.json({ error: "too_large" }, 413);

    const rows = parseCsv(raw);
    if (rows.length === 0 || !("phone" in (rows[0] ?? {}))) {
      return c.json({ error: "invalid_request" }, 400); // S5.1 — before any writes
    }

    const summary = await importContacts(pool, orgId, rows, actor.userId);
    return c.json(summary); // S5.8: counts only
  },
);
