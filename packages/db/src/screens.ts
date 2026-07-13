// Task 15 (spec §12 E: four console screens on real data) — org-scoped reads backing the
// task queue, contacts, live monitor, and dashboard screens. All through withOrg (raw pool
// access is a review-blocking smell). G1: runtime-agnostic — no bun:* imports, no Bun globals.
import type pg from "pg";
import { withOrg } from "./client";

export interface TaskRow {
  id: string;
  kind: string;
  status: string;
  priority: number | null;
  title: string;
  contact_id: string | null;
  conversation_id: string | null;
  due_at: string | null;
  created_at: string;
}

export async function listTasks(
  pool: pg.Pool,
  orgId: string,
): Promise<TaskRow[]> {
  return withOrg(pool, orgId, async (tx) => {
    const result = await tx.query(
      `select id, kind, status, priority::float8 as priority, title, contact_id, conversation_id,
              due_at::text as due_at, created_at::text as created_at
         from tasks
        order by (status = 'open') desc, priority asc nulls last, created_at desc
        limit 100`,
    );
    return result.rows;
  });
}

export interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  lifecycle_stage: string;
  score: number | null;
  last_interaction_at: string | null;
  created_at: string;
}

export async function listContacts(
  pool: pg.Pool,
  orgId: string,
): Promise<ContactRow[]> {
  return withOrg(pool, orgId, async (tx) => {
    const result = await tx.query(
      `select id, first_name, last_name, lifecycle_stage, score::float8 as score,
              last_interaction_at::text as last_interaction_at,
              created_at::text as created_at
         from contacts
        where deleted_at is null and merged_into_id is null
        order by last_interaction_at desc nulls last, created_at desc
        limit 100`,
    );
    return result.rows;
  });
}

export interface ConversationRow {
  id: string;
  channel: string;
  status: string;
  direction: string;
  contact_name: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export async function listConversations(
  pool: pg.Pool,
  orgId: string,
): Promise<ConversationRow[]> {
  return withOrg(pool, orgId, async (tx) => {
    const result = await tx.query(
      `select c.id, c.channel, c.status, c.direction,
              nullif(trim(concat(ct.first_name, ' ', ct.last_name)), '') as contact_name,
              c.started_at::text as started_at, c.ended_at::text as ended_at
         from conversations c
         left join contacts ct on ct.id = c.contact_id
        order by c.started_at desc nulls last
        limit 100`,
    );
    return result.rows;
  });
}

export interface FunnelMetrics {
  new_leads: number;
  conversations_started: number;
  conversations_completed: number;
  qualified: number;
  bookings: number;
  open_tasks: number;
}

export async function funnelMetrics(
  pool: pg.Pool,
  orgId: string,
): Promise<FunnelMetrics> {
  return withOrg(pool, orgId, async (tx) => {
    // Sequential — one PoolClient can only run one query at a time (Promise.all here would
    // interleave on the same connection, which pg deprecation-warns on and can misbehave).
    const newLeads = await tx.query(
      `select count(*)::int as n from contacts
        where deleted_at is null and created_at >= now() - interval '30 days'`,
    );
    const conversationsStarted = await tx.query(
      `select count(*)::int as n from conversations
        where started_at >= now() - interval '30 days'`,
    );
    const conversationsCompleted = await tx.query(
      `select count(*)::int as n from conversations
        where status = 'completed' and ended_at >= now() - interval '30 days'`,
    );
    const qualified = await tx.query(
      `select count(*)::int as n from outcomes
        where kind = 'qualified' and occurred_at >= now() - interval '30 days'`,
    );
    const bookings = await tx.query(
      `select count(*)::int as n from outcomes
        where kind = 'booking' and occurred_at >= now() - interval '30 days'`,
    );
    const openTasks = await tx.query(
      `select count(*)::int as n from tasks where status = 'open'`,
    );
    return {
      new_leads: newLeads.rows[0].n,
      conversations_started: conversationsStarted.rows[0].n,
      conversations_completed: conversationsCompleted.rows[0].n,
      qualified: qualified.rows[0].n,
      bookings: bookings.rows[0].n,
      open_tasks: openTasks.rows[0].n,
    };
  });
}
