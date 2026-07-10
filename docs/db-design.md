# Database Design — Vertical-Agnostic Revenue OS (V1)

> **Status:** Locked for V1 unless amended via the decision protocol (dev-workflow.md §13). This file is the single source of truth for the data layer.
> **Consumer:** Claude Code. Migrations should be generated from the DDL in this file, in order, via `supabase migration new <name>`. **Numbering truth (D33):** the V1 baseline `000`–`009` spans **§3–§8 + §13 + §14** — one file per `-- NNN_name.sql` marker; later migrations (`010`+) extend the baseline and are annotated inline where they amend it.
> **Companion doc:** `project-spec.md` (holistic decisions, architecture, build order).

---

## 1. DBMS decision

**Chosen: Supabase (Pro tier, ~$25/mo) — managed Postgres 15+ with RLS, pgvector, Auth, Storage, Realtime.**

| Option | Verdict | Why |
|---|---|---|
| **Supabase** | ✅ **Chosen** | RLS-first multi-tenancy is native; pgvector included; Auth replaces Clerk (one less integration); Storage holds call recordings; Realtime powers the live-transcript console. Four vendors collapsed into one bill. Plain Postgres underneath = `pg_dump` escape hatch. **Role: OLTP system of record only — the analytics/training data lake is a later export target, not a V1 build (see §11).** |
| Neon | 🥈 Runner-up | Excellent serverless Postgres + DB branching (great for AI-agent dev loops). But no bundled auth/storage/realtime — 3 extra integrations for a solo builder. Revisit if Supabase compute limits ever bite. |
| PlanetScale Postgres | ❌ Not now | Superb at scale (sharding, zero-downtime DDL) — problems we won't have for years. Pricier, no bundled services. |
| Cloudflare D1 | ❌ Disqualified | SQLite: no RLS, no pgvector. Wrong tool. (Cloudflare **R2** remains a candidate for recording storage later if egress costs matter.) |
| RDS / Cloud SQL | ❌ Not now | Ops burden with zero V1 benefit. |

**Durability engine decision (revised from sheet 3):** V1 uses **pg-boss** (Postgres-native job queue) + explicit `workflow_runs` state tables **in the same database** — not Temporal. Rationale: solo builder, 12-week deadline, <$500/mo budget; our sequences (call → wait 2h → WhatsApp → wait 1d → re-call) are timers + retries + state machines, well within pg-boss. The `workflow_runs` schema below is engine-agnostic: if we outgrow pg-boss, Temporal slots in behind the same tables. **One database runs everything at V1.**

**Roles & access discipline (critical):**
- Console/browser → Supabase Auth JWT → RLS enforced per user via org membership.
- Backend services (agent runtime, workers, webhooks) → connect as a dedicated `app_service` Postgres role that does **NOT** bypass RLS (never use the Supabase `service_role` key in app code). Every unit of work sets `request.org_id` via `set_config` inside its transaction.
- CI check (§8) fails the build if any public table has RLS disabled.

---

## 2. Conventions

- **IDs:** `uuid` via `gen_random_uuid()`. Time-ordering comes from `created_at` (indexed).
- **Timestamps:** `timestamptz` always. Every table: `created_at timestamptz not null default now()`; mutable tables add `updated_at` (trigger-maintained).
- **Tenancy:** every org-owned table has `org_id uuid not null references orgs(id)` as the **first** column after `id`, and composite indexes lead with `org_id`.
- **Soft delete:** only where user-facing undo matters (`contacts`, `deals`): `deleted_at timestamptz`. Everything else deletes hard or never deletes (append-only).
- **Append-only tables** (`audit_log`, `messages`, `interactions-as-messages`, `outcomes`, `contact_scores`, `usage_events`, `webhook_events`): no UPDATE/DELETE policies exist → immutable by RLS.
- **Org-configurable taxonomies** (dispositions, outcome kinds, pipeline stages) are **lookup tables seeded per vertical template**, not enums. Enums are reserved for sets we control forever.
- **Custom fields:** `attributes jsonb not null default '{}'` on contacts/companies/deals/appointments, validated against `field_definitions`.
- **Money:** `numeric(14,2)` + `currency char(3)`.
- **Phone numbers:** E.164 in `contact_identities.value`; normalization happens in app code before insert.

---

## 3. Extensions & schemas

```sql
-- 000_extensions.sql
create extension if not exists pgcrypto;      -- gen_random_uuid
create extension if not exists vector;        -- pgvector (embeddings)
create extension if not exists pg_trgm;       -- fuzzy search on names/companies

create schema if not exists app;              -- helper functions live here, not public
```

---

## 4. Tenancy & identity (Layer A)

```sql
-- 001_tenancy.sql
create type app.org_role as enum ('admin','operator','viewer');

create table orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  vertical    text not null default 'generic',       -- 'real_estate' | 'b2b_wholesale' | ...
  settings    jsonb not null default '{}',           -- timezone, locale defaults, branding
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Mirrors auth.users (Supabase); app-facing profile data
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  locale      text not null default 'en-IN',
  created_at  timestamptz not null default now()
);

create table org_members (
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        app.org_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table api_keys (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  key_hash    text not null unique,                  -- sha256; plaintext shown once
  scopes      text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Append-only. Doubles as the agent action trace (observability spine).
create type app.actor_type as enum ('user','agent','system','integration');

create table audit_log (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references orgs(id),
  actor_type    app.actor_type not null,
  actor_id      text,                                -- user uuid | agent key | integration key
  action        text not null,                       -- 'contact.update', 'call.place', 'tool.book_appointment'
  resource_type text,
  resource_id   text,
  before        jsonb,
  after         jsonb,
  meta          jsonb not null default '{}',         -- ip, request id, workflow_run_id, model, latency
  created_at    timestamptz not null default now()
);
create index audit_org_time on audit_log (org_id, created_at desc);
create index audit_resource on audit_log (org_id, resource_type, resource_id);
```

### RLS helpers + policy pattern

```sql
-- 002_rls.sql
-- SECURITY DEFINER added by migration 010 (D31): the function reads auth.jwt(), and the
-- managed `postgres` role cannot grant auth-schema usage to custom roles (app_service) —
-- member_role() below already uses the same pattern. Baseline 002 shipped without the flag.
create or replace function app.current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(current_setting('request.org_id', true), '')::uuid,
    (auth.jwt() ->> 'org_id')::uuid
  )
$$;

create or replace function app.member_role(target_org uuid) returns app.org_role
language sql stable security definer set search_path = public as $$
  select role from org_members
  where org_id = target_org and user_id = auth.uid()
$$;

create or replace function app.is_member(target_org uuid, min_role app.org_role default 'viewer')
returns boolean language sql stable as $$
  select case
    when current_setting('request.org_id', true) = target_org::text then true  -- backend path
    when min_role = 'viewer'   then app.member_role(target_org) is not null
    when min_role = 'operator' then app.member_role(target_org) in ('operator','admin')
    when min_role = 'admin'    then app.member_role(target_org) = 'admin'
  end
$$;

-- Grants (002, D33): policy expressions run as the QUERYING role — without USAGE on schema
-- app, every policy fails with "permission denied for schema app" (verified on the local
-- stack). app_service receives the same + DML on public via migration 010 (D31).
grant usage on schema app to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;
alter default privileges in schema app
  grant execute on functions to anon, authenticated, service_role;
```

**Policy pattern — illustrative, not positional** (D33). `contacts` is the example and does not exist until `003`: each migration carries the policies for its **own** tables — `002` holds only the helpers, grants, and policies for `001`'s tables. Repeat the pattern per table, taking the write role from the mapping below:

```sql
alter table contacts enable row level security;

create policy sel on contacts for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));

create policy ins on contacts for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));

create policy upd on contacts for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());

-- deletes: admin-only, and only on soft-deletable tables
create policy del on contacts for delete
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
```

Append-only tables get **only** `sel` + `ins` policies. `audit_log` insert is open to any member/service; no update/delete policies exist.

**Write-role mapping (D33 — as implemented across 002–009):**
- **Entities** (contacts, companies, deals, appointments, tasks, conversations, contact_memories, knowledge_documents/knowledge_chunks): write = `operator`.
- **Org configuration** (pipelines, pipeline_stages, dispositions, field_definitions, guardrail_policies, integrations, api_keys, agents, workflows, campaigns, eval_scenarios): write = `admin`.
- **Append-only** (§2 list): `sel` + `ins` only — immutability by RLS.
- **Global template rows** (`org_id is null` on agents/workflows/eval_scenarios): readable by any member, writable by nobody via RLS — managed only by migrations/seeds.

---

## 5. Data core — CRM entities (Layer B)

```sql
-- 003_crm.sql
create type app.lifecycle_stage as enum
  ('new','contacted','qualified','meeting_scheduled','opportunity','customer','lost','dnc');

create table companies (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  domain      text,
  attributes  jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
-- Split (D33): composite GIN over (uuid, trgm) fails on replay — uuid has no GIN operator
-- class (42704) without btree_gin, which S2.7's extension allowlist excludes.
create index companies_org on companies (org_id);
create index companies_name_trgm on companies using gin (name gin_trgm_ops);

create table contacts (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  company_id         uuid references companies(id),
  first_name         text,
  last_name          text,
  preferred_language text not null default 'en',        -- 'en' | 'hi' | 'hi-en' (Hinglish)
  timezone           text not null default 'Asia/Kolkata',
  lifecycle_stage    app.lifecycle_stage not null default 'new',
  source             text,                              -- 'csv_import' | 'meta_leads' | 'portal' | 'manual'
  owner_user_id      uuid references profiles(id),
  consent            jsonb not null default '{"dnc": false, "whatsapp_optin": null, "recording_consent": null}',
  attributes         jsonb not null default '{}',       -- vertical-specific custom fields
  score              numeric(6,2),                      -- denormalized cache of latest contact_scores row
  score_updated_at   timestamptz,
  last_interaction_at timestamptz,
  merged_into_id     uuid references contacts(id),      -- dedupe: set when merged; row kept for audit
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index contacts_org_stage on contacts (org_id, lifecycle_stage) where deleted_at is null;
create index contacts_org_score on contacts (org_id, score desc nulls last) where deleted_at is null;
create index contacts_org_last  on contacts (org_id, last_interaction_at desc nulls last);

-- Identity resolution: one row per phone/email/wa/external id. THE dedupe mechanism.
create type app.identity_kind as enum ('phone','email','whatsapp','external');

create table contact_identities (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  kind        app.identity_kind not null,
  value       text not null,                            -- E.164 for phone; lowercased for email
  is_primary  boolean not null default false,
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (org_id, kind, value)                          -- hard uniqueness = dedupe guarantee
);
create index ci_contact on contact_identities (contact_id);

-- Pipelines: seeded per vertical template; stages are org-configurable
create table pipelines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  key         text not null,
  name        text not null,
  unique (org_id, key)
);

create table pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  key         text not null,
  name        text not null,
  position    int not null,
  is_won      boolean not null default false,
  is_lost     boolean not null default false,
  unique (pipeline_id, key)
);

create type app.deal_status as enum ('open','won','lost');

create table deals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  contact_id    uuid not null references contacts(id),
  company_id    uuid references companies(id),
  pipeline_id   uuid not null references pipelines(id),
  stage_id      uuid not null references pipeline_stages(id),
  title         text not null,
  value_amount  numeric(14,2),
  currency      char(3) not null default 'INR',
  status        app.deal_status not null default 'open',
  expected_close date,
  attributes    jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index deals_org_status on deals (org_id, status, stage_id) where deleted_at is null;

-- Typed validation for jsonb custom fields
create table field_definitions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  entity      text not null check (entity in ('contact','company','deal','appointment')),
  key         text not null,
  label       text not null,
  field_type  text not null check (field_type in ('text','number','boolean','date','enum')),
  options     jsonb,                                    -- enum choices
  required    boolean not null default false,
  unique (org_id, entity, key)
);
```

---

## 6. Communication & conversations (Layer D writes here)

```sql
-- 004_conversations.sql
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
-- migration 012 (D33, task 8): "upsert by provider_ref" (CLAUDE.md gotcha) needs a uniqueness
-- guarantee a plain index can't give — webhooks arrive out of order and must converge on ONE row.
create unique index convo_provider_ref_uq on conversations (provider, provider_ref)
  where provider_ref is not null;

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
```

### Outcomes — the moat table

```sql
-- 005_outcomes.sql
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
```

---

## 7. Agentic harness tables (Layer C)

```sql
-- 006_harness.sql
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
```

---

## 8. Integrations, metering, evals (Layer E)

```sql
-- 007_ops.sql
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
  org_id      uuid references orgs(id),                   -- nullable in DDL — see resolution rule below
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

-- Org-resolution rule (D33): receivers MUST resolve org_id BEFORE insert. Org-scoped RLS makes
-- org_id-NULL rows unreachable — select AND insert — for the RLS-bound backend, so "resolve
-- later" rows are dead letters. Vapi interim: org id rides the per-assistant server URL
-- (+ shared secret, S6.2); the assistant-id→org mapping is a task-8 spike exit criterion.

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
```

### CI guardrail — RLS must cover everything

```sql
-- tests/rls_coverage.sql — CI fails if this returns rows
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity;
```

---

## 9. Seed templates (vertical packs)

`seeds/real_estate.sql` and `seeds/b2b_wholesale.sql` insert, per new org of that vertical:
- **dispositions** — RE: interested / site_visit_agreed / callback / budget_mismatch / wrong_number / dnc / not_interested. B2B: interested / sample_requested / callback / send_catalog / price_objection / wrong_person / dnc.
- **pipelines + stages** — RE: inquiry → qualified → site_visit → negotiation → token → closed. B2B: prospect → contacted → qualified → sample/quote → order → repeat.
- **outcome kinds** (documented list, since `outcomes.kind` is free text): see §6 comment.
- **field_definitions** — RE contact: budget_min/max, preferred_location, property_type, financing_needed. B2B contact/company: business_type (retailer/architect/builder), monthly_volume, city, gst_verified.
- **workflow** v1 definition (qualification flow) + **agent** v1 (system prompt, EN+HI voice map).
- **guardrail_policies**: quiet_hours 21:00–09:00 contact-tz, attempt_caps {voice:3/72h, whatsapp:2/24h}, dnc hard-stop, autonomy {book_appointment: auto, send_quote: approval}.
- **eval_scenarios**: 10 personas per vertical (angry, wrong-language, price-shopper, silent, competitor-snoop, ...).

---

## 10. The two pilots on one schema (proof of vertical-agnosticism)

| Concern | Real estate partner | Ceramic B2B brand |
|---|---|---|
| Who | contacts (+ attributes: budget, location) | companies + contacts (buyer at retailer/architect) |
| List in | Meta leads / portal webhook → webhook_events | CSV import → contacts + contact_identities |
| Core motion | inbound answer + follow-up → appointments (site_visit) | outbound_list campaign → qualify → tasks (callback) |
| "Hot list" | tasks WHERE kind='callback' ORDER BY priority | same query — priority written by scoring service |
| Outcomes | site_visit_booked / site_visit_done / token_paid | callback_requested / sample_requested / order_placed |
| Deal object | optional at V1 | natural (order pipeline) |

The ceramic deliverable ("ranked list of hot leads to get back to") is literally: `select * from tasks where org_id=? and status='open' and kind='callback' order by priority desc` — plus the console screen that renders it.

---

## 11. Scale path (documented, not built)

- **Partitioning:** `messages`, `audit_log`, `usage_events` → monthly range partitions when any exceeds ~20M rows.
- **Vector:** per-org partial HNSW indexes if KB grows past ~5M chunks; else fine.
- **Durability:** swap pg-boss → Temporal behind `workflow_runs` when sequences exceed ~50 steps or need signals/child workflows.
- **Data lake (when, not if):** V1 deliberately has no lake — volume doesn't justify it and Postgres → Parquet is a solved problem, so waiting loses nothing. The lake's *prerequisites* are already enforced at capture time: append-only raw events (`messages`, `webhook_events`, `audit_log`, `usage_events`, recordings), outcome linkage via FKs, and consent lineage. **Trigger:** any hot table crossing the partition thresholds above, or training/analytics workloads competing with production. **Architecture then:** nightly Parquet export of conversations/messages/outcomes/usage to object storage (Supabase Storage or R2) → query with DuckDB (zero infra) → graduate to ClickHouse/BigQuery only when volume demands. Never run BI or training reads on the OLTP primary.
- **Derived-data pipeline (moat):** scheduled job producing org-anonymized, aggregated, consent-filtered training sets (per data-rights clause) into a separate `derived` schema/bucket. This becomes the first feed of the lake above when it exists.
- **Read replicas / connection pooling:** Supavisor transaction mode already; replica at sustained >70% CPU.

---

## 12. Open items for Devesh

1. **Pilot #1 = ceramic B2B (decided).** Their CRM is unconfirmed → CSV import is the V1 connector until it is. Ask this week.
2. **Prospect list (decided):** brand provides the list (core pilot) AND wants discovery → scoped as **List Builder v0**, gated on pilot health. Schema support added in §13 below.
3. Recording consent flow per pilot (announce at call start) → wording lives in agent system prompt; flag stored in `contacts.consent`.

---

## 13. Addendum (2026-07-07) — prospect staging for List Builder v0

Scraped/API-sourced candidates must **never** land directly in `contacts` — unverified data would pollute the CRM, scoring, and dedupe guarantees. They stage here, get enriched and deduped, and are **promoted by human approval only**.

```sql
-- 008_prospect_candidates.sql
create table prospect_candidates (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references orgs(id) on delete cascade,
  source               text not null check (source in ('google_places','manual','import','other')),
  source_ref           text,                              -- e.g. Places place_id (idempotency key)
  company_name         text,
  contact_name         text,
  candidate_phone      text,                              -- raw; normalized to E.164 during enrichment
  city                 text,
  segment              text,                              -- 'retailer' | 'architect' | 'builder' | 'horeca'
  raw                  jsonb not null default '{}',       -- full source payload
  enrichment           jsonb not null default '{}',       -- normalized phone, website, hours, quality flags
  status               text not null default 'new' check (status in
    ('new','enriched','duplicate','approved','rejected','promoted')),
  duplicate_of_contact uuid references contacts(id),      -- set when phone matches contact_identities
  promoted_contact_id  uuid references contacts(id),      -- set on promotion
  reviewed_by          uuid references profiles(id),
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  unique (org_id, source, source_ref)
);
create index candidates_review_queue on prospect_candidates (org_id, status, created_at)
  where status in ('new','enriched');
```

**Flow:** adapter writes candidates (idempotent on `source_ref`) → enrichment job normalizes phone + flags quality → dedupe check against `contact_identities(org_id,'phone',value)` marks `duplicate` → operator approves/rejects in console (reuses the `tasks` review pattern) → promotion creates `companies` + `contacts` + `contact_identities` rows in one transaction, stamps `promoted_contact_id`.

**Guardrails for promoted cold contacts (non-negotiable):** `source='list_builder'` on the contact; voice-first outreach only (WhatsApp requires opt-in); stricter attempt caps (e.g. voice 2/7d) via a dedicated `guardrail_policies` entry; immediate hard-stop + `consent.dnc=true` on any opt-out; excluded from pilot success metrics (attribution stays clean on the provided list).

---

## 14. Addendum (2026-07-10) — support access & platform hardening

### 14.1 Time-boxed support access (D28)

Support/ops access to a tenant is an ordinary membership that expires — never an RLS bypass.

```sql
-- 009_support_access.sql
alter table org_members add column expires_at timestamptz;      -- NULL = permanent (tenant's own staff)
alter table org_members add column granted_by uuid references profiles(id);
alter table org_members add column reason text;

create or replace function app.member_role(target_org uuid) returns app.org_role
language sql stable security definer set search_path = public as $$
  select role from org_members
  where org_id = target_org
    and user_id = auth.uid()
    and (expires_at is null or expires_at > now())
$$;
```

Rules: grants default to 24h TTL; `granted_by` + `reason` mandatory for expiring rows; grant and revoke both emit `audit_log` entries; a nightly job deletes rows expired >7 days (history preserved in audit_log). The platform-admin console page (T21) is the only UI that writes these.

### 14.2 Platform configuration hardening (mirrors security.md S2 — set once, verified in the P4 audit)

- **PostgREST Data API: exposed schemas = none.** All data access goes through the Hono API; Auth/Storage/Realtime remain on. (S2.1)
- **Network restrictions ON:** direct Postgres reachable only from the VPS IP + Devesh's IP. (S2.2)
- **Storage buckets private** (`recordings/`, `kb-uploads/`, `exports/`); signed URLs ≤15 min minted by the API post-RLS-check. (S2.4)
- **Realtime authorization** policies scope channel subscriptions per org. (S2.5)
- **Backups:** Pro daily backups + one rehearsed restore in P3; weekly encrypted `pg_dump` → R2 (different provider) as the off-site copy of the moat. PITR add-on at first paying tenant. (S10)
- **Region:** project lives in `ap-south-1` (Mumbai) per D29.
