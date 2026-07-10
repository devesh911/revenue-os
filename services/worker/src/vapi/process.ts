// Vapi event processor — runs async of the receiver (pg-boss consumer in P2; called
// directly in tests until then). Semantics per the CLAUDE.md gotcha:
//   events arrive OUT OF ORDER → process by payload timestamp, upsert the conversation
//   by (provider, provider_ref), append messages with monotonically assigned seq.
import { withOrg } from "@revenue-os/db";
import { VapiWebhookSchema } from "@revenue-os/shared";
import type pg from "pg";

const ROLE_MAP = { assistant: "agent", user: "contact" } as const;

async function ensureConversation(
  tx: {
    query: (
      t: string,
      v?: unknown[],
    ) => Promise<{ rows: Record<string, unknown>[] }>;
  },
  orgId: string,
  callId: string,
  startedAt: string | null,
): Promise<string> {
  const r = await tx.query(
    `insert into conversations (org_id, channel, direction, status, provider, provider_ref, started_at)
		 values ($1, 'voice', 'inbound', 'active', 'vapi', $2, $3)
		 on conflict (provider, provider_ref) where provider_ref is not null
		 do update set provider = excluded.provider
		 returning id`,
    [orgId, callId, startedAt],
  );
  const id = r.rows[0]?.id;
  if (typeof id !== "string")
    throw new Error("conversation upsert returned no id");
  return id;
}

/** Process all 'received' vapi events for an org, ordered by payload timestamp. */
export async function processVapiEvents(
  pool: pg.Pool,
  orgId: string,
): Promise<void> {
  await withOrg(pool, orgId, async (tx) => {
    const events = await tx.query(
      `select id, payload from webhook_events
			 where org_id = $1 and provider = 'vapi' and status = 'received'
			 order by (payload -> 'message' ->> 'timestamp') asc nulls last, id asc
			 for update`,
      [orgId],
    );

    for (const row of events.rows) {
      const parsed = VapiWebhookSchema.safeParse(row.payload);
      const m = parsed.success ? parsed.data.message : null;
      const callId = m?.call?.id;

      let outcome: "processed" | "skipped" = "skipped";
      if (m && callId) {
        if (m.type === "transcript" && m.transcript && m.role) {
          const conversationId = await ensureConversation(
            tx,
            orgId,
            callId,
            m.timestamp ?? null,
          );
          await tx.query(
            `insert into messages (org_id, conversation_id, seq, role, content)
						 select $1, $2, coalesce(max(seq), 0) + 1, $3, $4 from messages where conversation_id = $2
						 on conflict (conversation_id, seq) do nothing`,
            [orgId, conversationId, ROLE_MAP[m.role], m.transcript],
          );
          outcome = "processed";
        } else if (m.type === "end-of-call-report") {
          const conversationId = await ensureConversation(
            tx,
            orgId,
            callId,
            null,
          );
          await tx.query(
            `update conversations set status = 'completed', ended_at = $2, summary = $3
						 where id = $1`,
            [
              conversationId,
              m.timestamp ?? new Date().toISOString(),
              m.summary ?? null,
            ],
          );
          outcome = "processed";
        } else if (m.type === "status-update") {
          await ensureConversation(tx, orgId, callId, m.timestamp ?? null);
          outcome = "processed";
        }
        // anything else: stored + skipped — never guessed at (S6.5)
      }

      await tx.query(
        `update webhook_events set status = $2, processed_at = now() where id = $1`,
        [row.id, outcome],
      );
    }
  });
}
