// Task 50 (spec §12 — console AgentsPage on real data) — org-scoped read of the org's agents +
// workflows for the console AgentsPage. Through withOrg (raw pool access is a review-blocking
// smell). The explicit `org_id = $1` filter is the drizzle-query.md belt-and-suspenders
// convention and deliberately EXCLUDES global-template rows (org_id IS NULL, member-readable under
// RLS per migration 006) — templates stay unlisted until a product need exists. Lean columns only:
// never system_prompt / voice_config / language_config / tools_allowed (agents) or definition
// (workflows) on the wire (S5.8). G1: runtime-agnostic — no bun:* imports, no Bun globals.
import type pg from "pg";
import { withOrg } from "./client";

export interface AgentRow {
  id: string;
  key: string;
  version: number;
  status: string;
  model: string;
  created_at: string;
}

export interface WorkflowRow {
  id: string;
  key: string;
  version: number;
  status: string;
  created_at: string;
}

export async function listAgentsAndWorkflows(
  pool: pg.Pool,
  orgId: string,
): Promise<{ agents: AgentRow[]; workflows: WorkflowRow[] }> {
  return withOrg(pool, orgId, async (tx) => {
    // Sequential — one PoolClient runs one query at a time (Promise.all would interleave on the
    // same connection; pg deprecation-warns and can misbehave). Mirrors funnelMetrics.
    const agents = await tx.query(
      `select id, key, version, status, model, created_at::text as created_at
         from agents
        where org_id = $1
        order by key asc, version desc`,
      [orgId],
    );
    const workflows = await tx.query(
      `select id, key, version, status, created_at::text as created_at
         from workflows
        where org_id = $1
        order by key asc, version desc`,
      [orgId],
    );
    return { agents: agents.rows, workflows: workflows.rows };
  });
}
