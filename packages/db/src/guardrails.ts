// task-52 — guardrail_policies read/write: the console Guardrails section reads these, the harness
// FAIL-OPEN quiet_hours hook reads config from the same rows. Org-scoped through withOrg (raw pool
// access is a review-blocking smell). Lean 4-column projection — no id/org_id on the wire (S5.8).
// Explicit org_id in every where/insert is belt-and-suspenders; withOrg's RLS is the actual net.
// G1: runtime-agnostic — no bun:* imports, no Bun globals.
import type pg from "pg";
import { withOrg } from "./client";

export interface GuardrailPolicyRow {
  key: string;
  config: Record<string, unknown>;
  active: boolean;
  updated_at: string;
}

export async function listGuardrailPolicies(
  pool: pg.Pool,
  orgId: string,
): Promise<GuardrailPolicyRow[]> {
  return withOrg(pool, orgId, async (tx) => {
    const result = await tx.query(
      `select key, config, active, updated_at::text as updated_at
         from guardrail_policies
        where org_id = $1
        order by key`,
      [orgId],
    );
    return result.rows;
  });
}

export async function upsertGuardrailPolicy(
  pool: pg.Pool,
  orgId: string,
  input: { key: string; config: unknown; active: boolean },
): Promise<GuardrailPolicyRow> {
  return withOrg(pool, orgId, async (tx) => {
    // `do update` MUST reset updated_at = now() so a re-PUT reports a strictly newer timestamp.
    const result = await tx.query(
      `insert into guardrail_policies (org_id, key, config, active)
       values ($1, $2, $3::jsonb, $4)
       on conflict (org_id, key) do update
         set config = excluded.config, active = excluded.active, updated_at = now()
       returning key, config, active, updated_at::text as updated_at`,
      [orgId, input.key, JSON.stringify(input.config), input.active],
    );
    return result.rows[0];
  });
}
