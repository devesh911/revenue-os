-- db-design §7 — verbatim DDL, then RLS
-- Versioned agent configs. Never mutate an active version; create the next one.
create table agents (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references orgs(id) on delete cascade,  -- NULL = global template
  key            text not null,
  version        int not null default 1,
  status         text not null default 'draft' check (status in ('draft','active','archived')),
  model          text not null,                           -- 'claude-sonnet-4-6' etc.
  system_prompt  text not null,
  tools_allowed  text[] not null default '{}',            -- MCP tool names
  voice_config   jsonb not null default '{}',             -- provider, voice id, per-language TTS map
  language_config jsonb not null default '{}',            -- supported langs, detection policy
  created_at     timestamptz not null default now(),
  unique (org_id, key, version)
);

-- Versioned workflow definitions (the AOP-style graph). Same versioning rule.
create table workflows (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references orgs(id) on delete cascade,     -- NULL = global template
  key         text not null,
  version     int not null default 1,
  status      text not null default 'draft' check (status in ('draft','active','archived')),
  definition  jsonb not null,       -- steps, transitions, waits, tool calls, guard refs
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  unique (org_id, key, version)
);

create table campaigns (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('inbound','outbound_followup','outbound_list')),
  workflow_id uuid not null references workflows(id),
  agent_id    uuid not null references agents(id),
  status      text not null default 'draft' check (status in ('draft','active','paused','completed')),
  config      jsonb not null default '{}',                -- channel priority, schedule window, list ref
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table conversations add constraint convo_campaign_fk
  foreign key (campaign_id) references campaigns(id);
alter table outcomes add constraint outcome_campaign_fk
  foreign key (campaign_id) references campaigns(id);

-- Durable execution state. Engine-agnostic (pg-boss now, Temporal later).
create type app.run_status as enum
  ('pending','running','waiting','completed','failed','canceled');

create table workflow_runs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  workflow_id    uuid not null references workflows(id),
  campaign_id    uuid references campaigns(id),
  contact_id     uuid not null references contacts(id),
  status         app.run_status not null default 'pending',
  current_step   text,
  state          jsonb not null default '{}',             -- accumulated step outputs
  wake_at        timestamptz,                             -- scheduler polls: status='waiting' and wake_at <= now()
  attempts       jsonb not null default '{}',             -- per-channel attempt counters (guardrails read this)
  started_at     timestamptz,
  completed_at   timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index runs_scheduler on workflow_runs (status, wake_at)
  where status in ('pending','waiting');
create index runs_contact on workflow_runs (org_id, contact_id, created_at desc);
alter table conversations add constraint convo_run_fk
  foreign key (workflow_run_id) references workflow_runs(id);
alter table outcomes add constraint outcome_run_fk
  foreign key (workflow_run_id) references workflow_runs(id);
alter table conversations add constraint convo_agent_fk
  foreign key (agent_id) references agents(id);

-- HITL queue: approvals, callbacks, reviews. THE ceramic-brand deliverable is a view over this.
create table tasks (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  contact_id       uuid references contacts(id),
  deal_id          uuid references deals(id),
  workflow_run_id  uuid references workflow_runs(id),
  conversation_id  uuid references conversations(id),
  kind             text not null check (kind in ('approval','callback','review','handoff','manual')),
  status           text not null default 'open' check (status in ('open','claimed','done','dismissed','expired')),
  priority         numeric(6,2),                          -- scoring service writes this
  title            text not null,
  payload          jsonb not null default '{}',           -- context for the human: summary, reason, suggested script
  assignee_user_id uuid references profiles(id),
  due_at           timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index tasks_queue on tasks (org_id, status, priority desc nulls last, due_at);

-- Guardrails as config (not code)
create table guardrail_policies (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references orgs(id) on delete cascade,
  key      text not null,                                 -- 'quiet_hours','attempt_caps','autonomy','dnc'
  config   jsonb not null,                                -- e.g. {"start":"21:00","end":"09:00","tz":"contact"}
  active   boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

-- Memory: per-contact long-term memory items (rolling summaries, preferences, objections)
create table contact_memories (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references orgs(id) on delete cascade,
  contact_id             uuid not null references contacts(id) on delete cascade,
  kind                   text not null check (kind in ('summary','preference','objection','fact')),
  content                text not null,
  embedding              vector(1536),
  source_conversation_id uuid references conversations(id),
  superseded_by          uuid references contact_memories(id),
  created_at             timestamptz not null default now()
);
create index memories_contact on contact_memories (org_id, contact_id)
  where superseded_by is null;

-- Tenant knowledge base (RAG): pricing, inventory, scripts, FAQs
create table knowledge_documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  title        text not null,
  source_type  text not null check (source_type in ('upload','url','text')),
  storage_path text,
  status       text not null default 'processing' check (status in ('processing','ready','failed')),
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

create table knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  document_id  uuid not null references knowledge_documents(id) on delete cascade,
  chunk_index  int not null,
  content      text not null,
  embedding    vector(1536) not null,
  token_count  int,
  unique (document_id, chunk_index)
);
create index chunks_embedding on knowledge_chunks
  using hnsw (embedding vector_cosine_ops);
-- Query pattern: WHERE org_id = ... ORDER BY embedding <=> $1 LIMIT k  (org filter first, always)

-- Scoring history: append-only; training data + audit trail. contacts.score is the cache.
create table contact_scores (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references orgs(id) on delete cascade,
  contact_id    uuid not null references contacts(id) on delete cascade,
  model_version text not null,                            -- 'heuristic-v1' | 'logreg-2026-08-01'
  score         numeric(6,2) not null,
  features      jsonb not null default '{}',              -- inputs used, for reproducibility
  computed_at   timestamptz not null default now()
);
create index scores_contact on contact_scores (org_id, contact_id, computed_at desc);

-- ── RLS ──

-- agents/workflows: org_id NULL = global template — readable by any authenticated member,
-- writable by nobody through RLS (templates land via migrations/seeds). Org rows: admin writes.
alter table agents enable row level security;
create policy sel on agents for select using (
  org_id is null or (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'))
);
create policy ins on agents for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
create policy upd on agents for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'))
  with check (org_id = app.current_org_id());

alter table workflows enable row level security;
create policy sel on workflows for select using (
  org_id is null or (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'))
);
create policy ins on workflows for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
create policy upd on workflows for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'))
  with check (org_id = app.current_org_id());

alter table campaigns enable row level security;
create policy sel on campaigns for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on campaigns for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
create policy upd on campaigns for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'))
  with check (org_id = app.current_org_id());

-- workflow_runs: worker-owned writes (backend path); no delete — runs are history
alter table workflow_runs enable row level security;
create policy sel on workflow_runs for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on workflow_runs for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
create policy upd on workflow_runs for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());

-- tasks: the console's daily surface — operators claim/complete; no delete (dismiss is a status)
alter table tasks enable row level security;
create policy sel on tasks for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on tasks for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
create policy upd on tasks for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());

alter table guardrail_policies enable row level security;
create policy sel on guardrail_policies for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on guardrail_policies for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
create policy upd on guardrail_policies for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'))
  with check (org_id = app.current_org_id());

-- contact_memories: worker-owned; superseding is an update on the old row; no delete
alter table contact_memories enable row level security;
create policy sel on contact_memories for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on contact_memories for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
create policy upd on contact_memories for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());

-- knowledge_documents: console-owned KB; deletion is destructive → admin
alter table knowledge_documents enable row level security;
create policy sel on knowledge_documents for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on knowledge_documents for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
create policy upd on knowledge_documents for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());
create policy del on knowledge_documents for delete
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));

-- knowledge_chunks: written by the ingestion worker; die via document cascade — sel + ins only
alter table knowledge_chunks enable row level security;
create policy sel on knowledge_chunks for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on knowledge_chunks for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));

-- contact_scores: append-only — sel + ins only
alter table contact_scores enable row level security;
create policy sel on contact_scores for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on contact_scores for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
