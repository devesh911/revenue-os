-- db-design §6 "Outcomes — the moat table" — verbatim DDL, then RLS
-- Every business result, first-class and append-only. Every scoring label reads from here.
-- kind is text (not enum): vertical templates seed the taxonomy.
--   real_estate: 'site_visit_booked','site_visit_done','token_paid','converted'
--   b2b_wholesale: 'callback_requested','sample_requested','order_placed','reorder'
create table outcomes (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  contact_id       uuid not null references contacts(id),
  deal_id          uuid references deals(id),
  campaign_id      uuid,
  workflow_run_id  uuid,
  conversation_id  uuid references conversations(id),     -- attribution: which touch produced it
  appointment_id   uuid references appointments(id),
  kind             text not null,
  value_amount     numeric(14,2),
  currency         char(3),
  occurred_at      timestamptz not null default now(),
  source           app.actor_type not null,               -- who recorded it: agent | user | integration | system
  attributes       jsonb not null default '{}',
  created_at       timestamptz not null default now()
);
create index outcomes_org_kind_time on outcomes (org_id, kind, occurred_at desc);
create index outcomes_contact       on outcomes (org_id, contact_id, occurred_at desc);

-- ── RLS: append-only — sel + ins only (moat invariant: outcomes are rows, never edited) ──
alter table outcomes enable row level security;
create policy sel on outcomes for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on outcomes for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
