// T26.1 — emit(audit_log): called by every side effect. Same-table contract as
// packages/db/audit, expressed over OrgScopedDb so the harness stays dependency-light.
// G1: runtime-agnostic.
import type { OrgCtx } from "./types";

export async function emitAudit(
  ctx: OrgCtx,
  entry: {
    actorType: "agent" | "system";
    actorId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.db.query(
    `insert into audit_log (org_id, actor_type, actor_id, action, resource_type, resource_id, meta)
		 values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      ctx.orgId,
      entry.actorType,
      entry.actorId ?? null,
      entry.action,
      entry.resourceType ?? null,
      entry.resourceId ?? null,
      JSON.stringify(entry.meta ?? {}),
    ],
  );
}
