-- db-design §8 — verbatim DDL, then RLS
create table integrations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  provider        text not null,                          -- 'zoho' | 'hubspot' | 'meta_leads' | 'gcal' | 'csv'
  status          text not null default 'connected' check (status in ('connected','error','disabled')),
  credentials_ref text,                                   -- Supabase Vault secret name. NEVER plaintext here.
  config          jsonb not null default '{}',
  last_sync_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (org_id, provider)
);

-- Idempotent inbound event log (webhooks from Vapi, Meta, CRM). Append-only.
create table webhook_events (
  id          bigint generated always as identity primary key,
  org_id      uuid references orgs(id),                   -- nullable until resolved
  provider    text not null,
  event_type  text not null,
  dedupe_key  text not null unique,                       -- provider event id → exactly-once processing
  payload     jsonb not null,
  status      text not null default 'received' check (status in ('received','processed','failed','skipped')),
  error       text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index webhooks_pending on webhook_events (status, received_at) where status = 'received';

-- Cost metering: every billable unit. Append-only. Margin per call = sum by conversation.
create table usage_events (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references orgs(id),
  conversation_id uuid references conversations(id),
  kind            text not null check (kind in ('llm','stt','tts','telephony','wa_message','embedding')),
  provider        text not null,
  quantity        numeric(12,4) not null,                 -- minutes, tokens/1k, messages
  unit            text not null,
  cost_usd        numeric(10,5) not null,
  meta            jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index usage_org_time on usage_events (org_id, created_at desc);

-- Evals: scripted caller personas run before any agent/workflow version activates
create table eval_scenarios (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references orgs(id) on delete cascade,  -- NULL = global
  key        text not null,
  persona    jsonb not null,                              -- who the fake caller is
  script     jsonb not null,                              -- turns / behaviors
  assertions jsonb not null,                              -- must-capture fields, forbidden claims, tone
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create table eval_runs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid references orgs(id),
  scenario_id      uuid not null references eval_scenarios(id),
  agent_id         uuid not null references agents(id),
  workflow_id      uuid references workflows(id),
  passed           boolean not null,
  scores           jsonb not null default '{}',
  transcript_ref   uuid references conversations(id),
  created_at       timestamptz not null default now()
);
create index eval_runs_agent on eval_runs (agent_id, created_at desc);

-- ── RLS ──

alter table integrations enable row level security;
create policy sel on integrations for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on integrations for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
create policy upd on integrations for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'))
  with check (org_id = app.current_org_id());
create policy del on integrations for delete
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));

-- webhook_events: org-scoped only — receivers must resolve org_id BEFORE insert
-- (rows with NULL org_id are unreachable under RLS; see lessons.md — resolution mechanism
-- is a task-8 spike exit criterion). Status transitions are updates by the worker.
alter table webhook_events enable row level security;
create policy sel on webhook_events for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on webhook_events for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
create policy upd on webhook_events for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());

-- usage_events: append-only — sel + ins only
alter table usage_events enable row level security;
create policy sel on usage_events for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on usage_events for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));

-- eval_scenarios: org_id NULL = global persona pack — readable by all members, unwritable via RLS
alter table eval_scenarios enable row level security;
create policy sel on eval_scenarios for select using (
  org_id is null or (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'))
);
create policy ins on eval_scenarios for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
create policy upd on eval_scenarios for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'))
  with check (org_id = app.current_org_id());

-- eval_runs: written by the eval harness under an org context
alter table eval_runs enable row level security;
create policy sel on eval_runs for select using (
  org_id is null or (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'))
);
create policy ins on eval_runs for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
