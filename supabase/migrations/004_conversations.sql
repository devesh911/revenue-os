-- db-design §6 (first block) — verbatim DDL, then RLS
create type app.channel      as enum ('voice','whatsapp','sms','email');
create type app.direction    as enum ('inbound','outbound');
create type app.convo_status as enum
  ('queued','ringing','active','completed','no_answer','busy','voicemail','failed','canceled');
create type app.agent_kind   as enum ('ai','human','hybrid');

create table conversations (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  contact_id       uuid references contacts(id),          -- nullable: unknown caller until resolved
  campaign_id      uuid,                                  -- fk added after campaigns table
  workflow_run_id  uuid,                                  -- fk added after workflow_runs table
  channel          app.channel not null,
  direction        app.direction not null,
  status           app.convo_status not null default 'queued',
  agent_kind       app.agent_kind not null default 'ai',
  handled_by_user_id uuid references profiles(id),        -- set on human takeover
  agent_id         uuid,                                  -- fk to agents (added below)
  language_detected text,
  provider         text,                                  -- 'vapi' | 'meta_wa' | ...
  provider_ref     text,                                  -- vapi call id / wa thread id
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds int,
  recording_path   text,                                  -- Supabase Storage path
  summary          text,                                  -- model-written, post-call
  extracted        jsonb not null default '{}',           -- qualification fields captured
  disposition_id   uuid,                                  -- fk added after dispositions
  cost             jsonb not null default '{}',           -- {stt_usd, llm_usd, tts_usd, telephony_usd, total_usd}
  qa               jsonb not null default '{}',           -- eval scores post-call
  created_at       timestamptz not null default now()
);
create index convo_org_time    on conversations (org_id, created_at desc);
create index convo_contact     on conversations (org_id, contact_id, created_at desc);
create index convo_provider    on conversations (provider, provider_ref);

-- Every utterance / message / tool call. Append-only. Highest-volume table.
create table messages (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references orgs(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  seq             int not null,
  role            text not null check (role in ('agent','contact','human_agent','system','tool')),
  content         text,
  tool_call       jsonb,                                  -- {name, args, result_ref, latency_ms}
  tokens          int,
  ts              timestamptz not null default now(),
  unique (conversation_id, seq)
);
create index messages_org_convo on messages (org_id, conversation_id, seq);

-- Org-configurable call-result taxonomy. Seeded per vertical. Console tags these.
-- THE outcome-labeling surface: disposition tagging feeds scoring.
create table dispositions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  key         text not null,
  label       text not null,
  category    text not null check (category in
    ('qualified','not_qualified','callback','dnc','wrong_number','converted','lost','other')),
  is_terminal boolean not null default false,
  position    int not null default 0,
  unique (org_id, key)
);
alter table conversations
  add constraint convo_disposition_fk foreign key (disposition_id) references dispositions(id);

create table appointments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  contact_id   uuid not null references contacts(id),
  deal_id      uuid references deals(id),
  kind         text not null,                             -- 'site_visit' | 'sales_call' | 'demo' (template-seeded)
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  timezone     text not null,
  status       text not null default 'scheduled' check (status in
    ('scheduled','confirmed','completed','no_show','canceled','rescheduled')),
  external_ref text,                                      -- Google Calendar event id
  reminder_state jsonb not null default '{}',             -- which reminders sent, when
  created_by   app.actor_type not null default 'agent',
  attributes   jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index appt_org_time on appointments (org_id, starts_at);
create index appt_contact  on appointments (org_id, contact_id);

-- ── RLS ──

-- conversations: worker writes via backend path; console updates on takeover/tagging. No delete.
alter table conversations enable row level security;
create policy sel on conversations for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on conversations for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
create policy upd on conversations for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());

-- messages: append-only — sel + ins only, immutable by RLS
alter table messages enable row level security;
create policy sel on messages for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on messages for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));

alter table dispositions enable row level security;
create policy sel on dispositions for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on dispositions for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
create policy upd on dispositions for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'))
  with check (org_id = app.current_org_id());
create policy del on dispositions for delete
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));

-- appointments: no delete policy — cancellation is a status, not a row removal
alter table appointments enable row level security;
create policy sel on appointments for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on appointments for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
create policy upd on appointments for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());
