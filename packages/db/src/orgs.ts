// Org bootstrap + membership helpers — the only sanctioned queries for these flows (D21).
// G1: runtime-agnostic.
import type { AddMember, CreateOrg, OrgRole } from "@revenue-os/shared";
import type pg from "pg";
import { withOrg } from "./client";

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}

/** Create an org and its first admin membership in one org-scoped transaction. */
export async function createOrgWithAdmin(
  pool: pg.Pool,
  input: CreateOrg & { userId: string },
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await withOrg(pool, id, async (tx) => {
    await tx.query(
      `insert into orgs (id, name, slug, vertical) values ($1, $2, $3, $4)`,
      [id, input.name, input.slug, input.vertical],
    );
    await tx.query(
      `insert into org_members (org_id, user_id, role) values ($1, $2, 'admin')`,
      [id, input.userId],
    );
  });
  return { id };
}

/** The caller's effective role in an org, honoring support-access expiry (D28). */
export async function memberRole(
  pool: pg.Pool,
  orgId: string,
  userId: string,
): Promise<OrgRole | null> {
  return withOrg(pool, orgId, async (tx) => {
    const r = await tx.query(
      `select role from org_members
			 where org_id = $1 and user_id = $2 and (expires_at is null or expires_at > now())`,
      [orgId, userId],
    );
    return (r.rows[0]?.role as OrgRole) ?? null;
  });
}

export async function addMember(
  pool: pg.Pool,
  orgId: string,
  member: AddMember,
): Promise<void> {
  await withOrg(pool, orgId, async (tx) => {
    await tx.query(
      `insert into org_members (org_id, user_id, role) values ($1, $2, $3)`,
      [orgId, member.userId, member.role],
    );
  });
}

/** Cross-org by nature (login → org switcher): served by the app.user_orgs SECURITY DEFINER
 *  function, granted to app_service only. userId MUST be a jose-verified JWT sub. */
export async function userOrgs(
  pool: pg.Pool,
  userId: string,
): Promise<OrgRow[]> {
  const r = await pool.query(
    `select org_id as id, name, slug, role from app.user_orgs($1)`,
    [userId],
  );
  return r.rows as OrgRow[];
}
