// Contact import (ceramic path, D19) — dedupe THROUGH contact_identities uniqueness
// (org_id, kind, value): the schema is the guarantee, the code just routes around it.
// G1: runtime-agnostic.
import { normalizePhoneE164 } from "@revenue-os/shared";
import type pg from "pg";
import { audit } from "./audit";
import { withOrg } from "./client";

const CORE_COLUMNS = new Set(["first_name", "last_name", "phone"]);

export interface ImportSummary {
  created: number;
  merged: number;
  invalid: number;
}

export async function importContacts(
  pool: pg.Pool,
  orgId: string,
  rows: Record<string, string>[],
  actorUserId: string,
): Promise<ImportSummary> {
  return withOrg(pool, orgId, async (tx) => {
    const summary: ImportSummary = { created: 0, merged: 0, invalid: 0 };

    for (const row of rows) {
      const phone = normalizePhoneE164(row.phone ?? "");
      if (!phone) {
        summary.invalid++;
        continue;
      }
      const attributes: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        if (!CORE_COLUMNS.has(k) && v !== "") attributes[k] = v;
      }

      const existing = await tx.query(
        `select contact_id from contact_identities
				 where org_id = $1 and kind = 'phone' and value = $2`,
        [orgId, phone],
      );

      if (existing.rows.length > 0) {
        // merge: enrich attributes + fill missing names on the EXISTING contact — never a new row
        await tx.query(
          `update contacts set
					   attributes = attributes || $2::jsonb,
					   first_name = coalesce(first_name, nullif($3, '')),
					   last_name  = coalesce(last_name,  nullif($4, '')),
					   updated_at = now()
					 where id = $1 and org_id = $5`,
          [
            existing.rows[0].contact_id,
            JSON.stringify(attributes),
            row.first_name ?? "",
            row.last_name ?? "",
            orgId,
          ],
        );
        summary.merged++;
      } else {
        const contact = await tx.query(
          `insert into contacts (org_id, first_name, last_name, source, attributes)
					 values ($1, nullif($2, ''), nullif($3, ''), 'csv_import', $4) returning id`,
          [
            orgId,
            row.first_name ?? "",
            row.last_name ?? "",
            JSON.stringify(attributes),
          ],
        );
        await tx.query(
          `insert into contact_identities (org_id, contact_id, kind, value, is_primary)
					 values ($1, $2, 'phone', $3, true)`,
          [orgId, contact.rows[0].id, phone],
        );
        summary.created++;
      }
    }

    await audit(tx, orgId, {
      actorType: "user",
      actorId: actorUserId,
      action: "contacts.import",
      resourceType: "contacts",
      meta: { ...summary, rows: rows.length },
    });
    return summary;
  });
}
