// Guardrail policies API: GET for any org member, PUT admin-only (docs/security.md S1.7).
// docs/patterns/hono-route.md shape: validate → authorize → do. The PUT's
// GuardrailPolicyInputSchema.parse is the safety boundary for the FAIL-OPEN quiet_hours hook —
// a malformed config, or a body that is missing or isn't JSON, is a 400 (src/errors.ts maps ZodError) with NOTHING
// written.
import {
  listGuardrailPolicies,
  memberRole,
  upsertGuardrailPolicy,
} from "@revenue-os/db";
import { GuardrailPolicyInputSchema, OrgIdSchema } from "@revenue-os/shared";
import { Hono } from "hono";
import type { AuthEnv } from "../auth";
import { pool } from "../db";
import { jsonBody } from "../json-body";

export const guardrailPolicies = new Hono<AuthEnv>()
  .get("/orgs/:orgId/guardrail-policies", async (c) => {
    const orgId = OrgIdSchema.parse(c.req.param("orgId")); // S5.1 — before ANY logic
    const actor = c.get("actor");
    const role = await memberRole(pool, orgId, actor.userId);
    if (role === null) return c.json({ error: "forbidden" }, 403);
    const policies = await listGuardrailPolicies(pool, orgId);
    return c.json({ policies }); // S5.8 — no internals
  })
  .put("/orgs/:orgId/guardrail-policies", async (c) => {
    const orgId = OrgIdSchema.parse(c.req.param("orgId")); // S5.1
    const body = GuardrailPolicyInputSchema.parse(await jsonBody(c)); // the safety boundary
    const actor = c.get("actor");
    const role = await memberRole(pool, orgId, actor.userId); // S1.7 — admin gate
    if (role !== "admin") return c.json({ error: "forbidden" }, 403);
    const policy = await upsertGuardrailPolicy(pool, orgId, body);
    return c.json({ policy });
  });
